import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseQuery } from "@/lib/api";
import { workspaceQuerySchema } from "@/lib/validation";
import { requireMembership } from "@/server/authz";
import { listProjectSummaries } from "@/server/projects";
import { Tag } from "@/models/Tag";
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
    const { workspaceId } = parseQuery(request, workspaceQuerySchema);
    const membership = await requireMembership(user, workspaceId);
    await connectDB();
    const wsId = membership.workspaceId;

    const [projects, tags, memberRows] = await Promise.all([
      listProjectSummaries(wsId),
      Tag.find({ workspaceId: wsId }).sort({ name: 1 }).lean(),
      WorkspaceMember.find({ workspaceId: wsId }).select("userId role").lean(),
    ]);

    const refs = await fetchUserRefs(memberRows.map((m) => m.userId));
    const roleById = new Map(memberRows.map((m) => [m.userId.toString(), m.role]));

    return ok({
      projects,
      tags: tags.map((t) => ({ ...t, id: t._id.toString() })),
      members: refs.map((r) => ({ ...r, role: roleById.get(r.id) ?? "MEMBER" })),
    });
  } catch (error) {
    return handleError(error);
  }
}
