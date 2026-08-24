import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { milestoneSchema } from "@/lib/validation";
import { requireProject } from "@/server/authz";
import { Project } from "@/models/Project";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { project } = await requireProject(user, id, "MEMBER");
    const input = await parseBody(request, milestoneSchema);
    await connectDB();

    const updated = await Project.findByIdAndUpdate(
      project._id,
      { $push: { milestones: input } },
      { new: true },
    ).lean();
    if (!updated) return fail("Project not found", "NOT_FOUND", 404);
    return ok({ project: updated }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { project } = await requireProject(user, id, "MEMBER");
    const milestoneId = new URL(request.url).searchParams.get("milestoneId");
    if (!milestoneId) return fail("milestoneId is required", "VALIDATION_ERROR", 422);
    await connectDB();
    const updated = await Project.findByIdAndUpdate(
      project._id,
      { $pull: { milestones: { _id: milestoneId } } },
      { new: true },
    ).lean();
    return ok({ project: updated });
  } catch (error) {
    return handleError(error);
  }
}
