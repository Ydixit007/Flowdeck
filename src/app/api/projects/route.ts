import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody, parseQuery } from "@/lib/api";
import { createProjectSchema, workspaceQuerySchema } from "@/lib/validation";
import { requireMembership } from "@/server/authz";
import { Project } from "@/models/Project";
import { listProjectSummaries } from "@/server/projects";
import { logActivity } from "@/server/activity";

export type { ProjectSummary } from "@/server/projects";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { workspaceId } = parseQuery(request, workspaceQuerySchema);
    const membership = await requireMembership(user, workspaceId);
    await connectDB();
    return ok({ projects: await listProjectSummaries(membership.workspaceId) });
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
