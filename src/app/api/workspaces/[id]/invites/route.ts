import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { inviteSchema } from "@/lib/validation";
import { isWorkspaceAdmin, requireMembership } from "@/server/authz";
import { Invite, WorkspaceMember } from "@/models/Workspace";
import { User } from "@/models/User";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const membership = await requireMembership(user, id, "ADMIN");
    await connectDB();
    const invites = await Invite.find({ workspaceId: membership.workspaceId, acceptedAt: null })
      .sort({ createdAt: -1 })
      .lean();
    return ok({ invites });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const membership = await requireMembership(user, id, "ADMIN");
    if (!isWorkspaceAdmin(membership.role)) return fail("Admins only", "FORBIDDEN", 403);
    const input = await parseBody(request, inviteSchema);
    await connectDB();

    const existingUser = await User.findOne({ email: input.email }).select("_id").lean();
    if (existingUser) {
      const already = await WorkspaceMember.exists({
        workspaceId: membership.workspaceId,
        userId: existingUser._id,
      });
      if (already) return fail("That person is already a member", "DUPLICATE", 409);
      // Known user: add them straight away, no email round-trip needed.
      await WorkspaceMember.create({
        workspaceId: membership.workspaceId,
        userId: existingUser._id,
        role: input.role,
      });
      return ok({ added: true }, 201);
    }

    const token = randomBytes(24).toString("hex");
    const invite = await Invite.create({
      workspaceId: membership.workspaceId,
      email: input.email,
      role: input.role,
      token,
      invitedById: user._id,
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    });
    // No mail transport configured; surface the link so it can be shared manually.
    return ok({ invite: invite.toObject(), link: `/register?invite=${token}` }, 201);
  } catch (error) {
    return handleError(error);
  }
}
