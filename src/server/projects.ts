import "server-only";
import type { Types } from "mongoose";
import { Project, type ProjectDoc } from "@/models/Project";
import { Task } from "@/models/Task";

export interface ProjectSummary extends Omit<ProjectDoc, "_id" | "workspaceId" | "ownerId" | "memberIds"> {
  id: string;
  workspaceId: string;
  ownerId: string;
  memberIds: string[];
  taskCount: number;
  doneCount: number;
  overdueCount: number;
}

/** Projects plus their task counts, in two queries rather than one per project. */
export async function listProjectSummaries(workspaceId: Types.ObjectId): Promise<ProjectSummary[]> {
  const now = new Date();
  const [projects, stats] = await Promise.all([
    Project.find({ workspaceId }).sort({ createdAt: 1 }).lean<ProjectDoc[]>(),
    Task.aggregate<{ _id: { projectId: string; bucket: string }; count: number }>([
      { $match: { workspaceId, projectId: { $ne: null } } },
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

  const byProject = new Map<string, { total: number; done: number; overdue: number }>();
  for (const row of stats) {
    const key = String(row._id.projectId);
    const entry = byProject.get(key) ?? { total: 0, done: 0, overdue: 0 };
    entry.total += row.count;
    if (row._id.bucket === "done") entry.done += row.count;
    if (row._id.bucket === "overdue") entry.overdue += row.count;
    byProject.set(key, entry);
  }

  return projects.map((p) => {
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
    } as ProjectSummary;
  });
}
