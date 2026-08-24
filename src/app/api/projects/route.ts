import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody, parseQuery } from "@/lib/api";
import { createProjectSchema, objectId } from "@/lib/validation";
import { requireMembership } from "@/server/authz";
import { Project, type ProjectDoc } from "@/models/Project";
import { Task } from "@/models/Task";
import { logActivity } from "@/server/activity";

export interface ProjectSummary extends Omit<ProjectDoc, "_id" | "workspaceId" | "ownerId" | "memberIds"> {
  id: string;
  workspaceId: string;
  ownerId: string;
  memberIds: string[];
  taskCount: number;
  doneCount: number;
  overdueCount: number;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { workspaceId } = parseQuery(request, z.object({ workspaceId: objectId }));
    const membership = await requireMembership(user, workspaceId);
    await connectDB();

    const projects = await Project.find({ workspaceId: membership.workspaceId })
      .sort({ createdAt: 1 })
      .lean<ProjectDoc[]>();

    const now = new Date();
    const stats = await Task.aggregate<{
      _id: { projectId: string; bucket: string };
      count: number;
    }>([
      { $match: { workspaceId: membership.workspaceId, projectId: { $ne: null } } },
      {
        $project: {
          projectId: 1,
          bucket: {
            $switch: {
              branches: [
                { case: { $eq: ["$status", "DONE"] }, then: "done" },
                {
                  case: {
                    $and: [
                      { $ne: ["$status", "CANCELLED"] },
                      { $ne: ["$dueAt", null] },
                      { $lt: ["$dueAt", now] },
                    ],
                  },
                  then: "overdue",
                },
              ],
              default: "open",
            },
          },
        },
      },
      { $group: { _id: { projectId: "$projectId", bucket: "$bucket" }, count: { $sum: 1 } } },
    ]);

    const byProject = new Map<string, { total: number; done: number; overdue: number }>();
    for (const row of stats) {
      const key = String(row._id.projectId);
      const entry = byProject.get(key) ?? { total: 0, done: 0, overdue: 0 };
      entry.total += row.count;
      if (row._id.bucket === "done") entry.done += row.count;
      if (row._id.bucket === "overdue") entry.overdue += row.count;
      byProject.set(key, entry);
    }

    return ok({
      projects: projects.map((p) => {
        const s = byProject.get(p._id.toString()) ?? { total: 0, done: 0, overdue: 0 };
        return {
          ...p,
          id: p._id.toString(),
          workspaceId: p.workspaceId.toString(),
          ownerId: p.ownerId.toString(),
          memberIds: (p.memberIds ?? []).map((m) => m.toString()),
          taskCount: s.total,
          doneCount: s.done,
          overdueCount: s.overdue,
        };
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, createProjectSchema);
    const { workspaceId } = await requireMembership(user, input.workspaceId, "MEMBER");
    await connectDB();

    const project = await Project.create({
      ...input,
      workspaceId,
      ownerId: user._id,
      memberIds: [...new Set([user._id.toString(), ...input.memberIds])],
    });

    await logActivity({
      workspaceId,
      actorId: user._id,
      kind: "PROJECT_CREATED",
      projectId: project._id,
      summary: `created project ${project.name}`,
    });

    return ok({ project: project.toObject() }, 201);
  } catch (error) {
    return handleError(error);
  }
}
