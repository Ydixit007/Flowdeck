import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody } from "@/lib/api";
import { createWorkspaceSchema } from "@/lib/validation";
import { Workspace, WorkspaceMember } from "@/models/Workspace";
import { listMemberships } from "@/server/authz";

export async function GET() {
  try {
    const user = await requireUser();
    const memberships = await listMemberships(user);
    await connectDB();
    const workspaces = await Workspace.find({ _id: { $in: memberships.map((m) => m.workspaceId) } })
      .sort({ createdAt: 1 })
      .lean();
    const roleById = new Map(memberships.map((m) => [m.workspaceId.toString(), m.role]));
    return ok({
      workspaces: workspaces.map((w) => ({
        id: w._id.toString(),
        name: w.name,
        slug: w.slug,
        color: w.color,
        ownerId: w.ownerId.toString(),
        role: roleById.get(w._id.toString()) ?? "MEMBER",
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, createWorkspaceSchema);
    await connectDB();
    const workspace = await Workspace.create({
      name: input.name,
      color: input.color ?? "#6366f1",
      slug: `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${Date.now().toString(36)}`,
      ownerId: user._id,
    });
    await WorkspaceMember.create({ workspaceId: workspace._id, userId: user._id, role: "OWNER" });
    // Same shape as GET, so the client can use it without a second fetch.
    return ok(
      {
        workspace: {
          id: workspace._id.toString(),
          name: workspace.name,
          slug: workspace.slug,
          color: workspace.color,
          ownerId: workspace.ownerId.toString(),
          role: "OWNER" as const,
        },
      },
      201,
    );
  } catch (error) {
    return handleError(error);
  }
}
