import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseQuery } from "@/lib/api";
import { objectId } from "@/lib/validation";
import { requireMembership } from "@/server/authz";
import { Project, type ProjectDoc } from "@/models/Project";
import { Tag } from "@/models/Tag";
import { Task } from "@/models/Task";
import { WorkspaceMember } from "@/models/Workspace";
import { fetchUserRefs } from "@/server/users";

/**
 * Everything the client store needs on mount, in one round trip.
 * Three separate calls each paid for their own auth + membership lookup;
 * against a Mumbai database that was the bulk of the perceived load time.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { workspaceId } = parseQuery(request, z.object({ workspaceId: objectId }));
    const membership = await requireMembership(user, workspaceId);
    await connectDB();
    const wsId = membership.workspaceId;
    const now = new Date();

    const [projects, tags, memberRows, stats] = await Promise.all([
      Project.find({ workspaceId: wsId }).sort({ createdAt: 1 }).lean<ProjectDoc[]>(),
      Tag.find({ workspaceId: wsId }).sort({ name: 1 }).lean(),
      WorkspaceMember.find({ workspaceId: wsId }).select("userId role").lean(),
      Task.aggregate<{ _id: { projectId: string; bucket: string }; count: number }>([
        { $match: { workspaceId: wsId, projectId: { $ne: null } } },
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
      ]),
    ]);

    const refs = await fetchUserRefs(memberRows.map((m) => m.userId));
    const roleById = new Map(memberRows.map((m) => [m.userId.toString(), m.role]));

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
      tags: tags.map((t) => ({ ...t, id: t._id.toString() })),
      members: refs.map((r) => ({ ...r, role: roleById.get(r.id) ?? "MEMBER" })),
    });
  } catch (error) {
    return handleError(error);
  }
}
