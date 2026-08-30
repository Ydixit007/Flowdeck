import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, type RouteContext } from "@/lib/api";
import { requireMembership, listMemberships } from "@/server/authz";
import { Workspace, WorkspaceMember, Invite } from "@/models/Workspace";
import { Project } from "@/models/Project";
import { Task, TaskOccurrence } from "@/models/Task";
import { Tag } from "@/models/Tag";
import { Comment, Activity, Notification, Attachment } from "@/models/Social";

/** Every collection that scopes rows by workspaceId. Deleting a workspace
 *  clears all of them; nothing here is shared with another workspace. */
const SCOPED_MODELS: { deleteMany: (filter: Record<string, unknown>) => unknown }[] = [
  Task,
  TaskOccurrence,
  Project,
  Tag,
  Comment,
  Activity,
  Notification,
  Attachment,
  Invite,
  WorkspaceMember,
];

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { workspaceId } = await requireMembership(user, id, "OWNER");

    await connectDB();
    const workspace = await Workspace.findById(workspaceId).select("ownerId").lean();
    if (!workspace) return fail("Workspace not found", "NOT_FOUND", 404);
    if (!workspace.ownerId.equals(user._id)) {
      return fail("Only the workspace owner can delete it", "FORBIDDEN", 403);
    }

    // Leaving the user with zero workspaces breaks every screen that needs one.
    const memberships = await listMemberships(user);
    if (memberships.length <= 1) {
      return fail("You cannot delete your only workspace", "FORBIDDEN", 403);
    }

    // ponytail: sequential deleteMany, no transaction. A replica-set session
    // would make this atomic if partial deletes ever become a real problem.
    await Promise.all(SCOPED_MODELS.map((m) => m.deleteMany({ workspaceId })));
    await Workspace.deleteOne({ _id: workspaceId });

    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
