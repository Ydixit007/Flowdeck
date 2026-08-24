import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { updateProjectSchema } from "@/lib/validation";
import { isWorkspaceAdmin, requireProject } from "@/server/authz";
import { Project } from "@/models/Project";
import { Task } from "@/models/Task";
import { logActivity } from "@/server/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { project } = await requireProject(user, id);
    return ok({ project });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { project, membership } = await requireProject(user, id, "MEMBER");
    if (!project.ownerId.equals(user._id) && !isWorkspaceAdmin(membership.role)) {
      return fail("Only the project owner or a workspace admin can edit this project", "FORBIDDEN", 403);
    }
    const input = await parseBody(request, updateProjectSchema);
    await connectDB();

    const updated = await Project.findByIdAndUpdate(project._id, { $set: input }, { new: true }).lean();
    if (!updated) return fail("Project not found", "NOT_FOUND", 404);

    await logActivity({
      workspaceId: project.workspaceId,
      actorId: user._id,
      kind: "PROJECT_UPDATED",
      projectId: project._id,
      summary: `updated project ${updated.name}`,
    });
    return ok({ project: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { project, membership } = await requireProject(user, id, "MEMBER");
    if (!project.ownerId.equals(user._id) && !isWorkspaceAdmin(membership.role)) {
      return fail("Only the project owner or a workspace admin can delete this project", "FORBIDDEN", 403);
    }
    await connectDB();
    // Tasks survive; they simply return to the workspace backlog.
    await Task.updateMany({ projectId: project._id }, { $set: { projectId: null, milestoneId: null } });
    await Project.deleteOne({ _id: project._id });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
