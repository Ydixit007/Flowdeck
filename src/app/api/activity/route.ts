import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseQuery } from "@/lib/api";
import { objectId } from "@/lib/validation";
import { requireMembership } from "@/server/authz";
import { Activity } from "@/models/Social";
import { fetchUserRefs } from "@/server/users";

const querySchema = z.object({
  workspaceId: objectId,
  projectId: objectId.optional(),
  taskId: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const query = parseQuery(request, querySchema);
    const { workspaceId } = await requireMembership(user, query.workspaceId);
    await connectDB();

    const rows = await Activity.find({
      workspaceId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.taskId ? { taskId: query.taskId } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(query.limit ?? 40)
      .lean();

    const actors = await fetchUserRefs(rows.map((r) => r.actorId));
    return ok({
      activity: rows.map((r) => ({
        id: r._id.toString(),
        kind: r.kind,
        summary: r.summary,
        actorId: r.actorId.toString(),
        taskId: r.taskId?.toString() ?? null,
        projectId: r.projectId?.toString() ?? null,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
      actors,
    });
  } catch (error) {
    return handleError(error);
  }
}
