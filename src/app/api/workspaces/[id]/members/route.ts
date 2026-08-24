import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { objectId } from "@/lib/validation";
import { isWorkspaceAdmin, requireMembership } from "@/server/authz";
import { Workspace, WorkspaceMember } from "@/models/Workspace";
import { Task } from "@/models/Task";
import { fetchUserRefs } from "@/server/users";
import { logActivity } from "@/server/activity";
import { WORKSPACE_ROLES } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { workspaceId } = await requireMembership(user, id);
    await connectDB();
    const members = await WorkspaceMember.find({ workspaceId }).lean();
    const refs = await fetchUserRefs(members.map((m) => m.userId));
    const roleById = new Map(members.map((m) => [m.userId.toString(), m.role]));
    return ok({
      members: refs.map((r) => ({ ...r, role: roleById.get(r.id) ?? "MEMBER" })),
    });
  } catch (error) {
    return handleError(error);
  }
}

const patchSchema = z.object({ userId: objectId, role: z.enum(WORKSPACE_ROLES) });

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const membership = await requireMembership(user, id, "ADMIN");
    if (!isWorkspaceAdmin(membership.role)) return fail("Admins only", "FORBIDDEN", 403);
    const input = await parseBody(request, patchSchema);
    await connectDB();

    const workspace = await Workspace.findById(membership.workspaceId).select("ownerId").lean();
    if (workspace?.ownerId.equals(input.userId) && input.role !== "OWNER") {
      return fail("The workspace owner's role cannot be changed", "FORBIDDEN", 403);
    }

    await WorkspaceMember.updateOne(
      { workspaceId: membership.workspaceId, userId: input.userId },
      { $set: { role: input.role } },
    );
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const membership = await requireMembership(user, id);
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) return fail("userId is required", "VALIDATION_ERROR", 422);

    const removingSelf = user._id.toString() === userId;
    if (!removingSelf && !isWorkspaceAdmin(membership.role)) {
      return fail("Only admins can remove other members", "FORBIDDEN", 403);
    }

    await connectDB();
    const workspace = await Workspace.findById(membership.workspaceId).select("ownerId").lean();
    if (workspace?.ownerId.toString() === userId) {
      return fail("The workspace owner cannot be removed", "FORBIDDEN", 403);
    }

    await WorkspaceMember.deleteOne({ workspaceId: membership.workspaceId, userId });
    // Unassign rather than delete their work.
    await Task.updateMany(
      { workspaceId: membership.workspaceId, assigneeId: userId },
      { $set: { assigneeId: null } },
    );
    await logActivity({
      workspaceId: membership.workspaceId,
      actorId: user._id,
      kind: "MEMBER_REMOVED",
      summary: removingSelf ? "left the workspace" : "removed a member",
    });
    return ok({ removed: true });
  } catch (error) {
    return handleError(error);
  }
}
