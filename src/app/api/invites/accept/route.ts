import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { Invite, WorkspaceMember } from "@/models/Workspace";
import { logActivity } from "@/server/activity";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const { token } = await parseBody(request, z.object({ token: z.string().min(8) }));
    await connectDB();

    const invite = await Invite.findOne({ token, acceptedAt: null, expiresAt: { $gt: new Date() } });
    if (!invite) return fail("This invite is invalid or expired", "INVALID_TOKEN", 400);

    await WorkspaceMember.updateOne(
      { workspaceId: invite.workspaceId, userId: user._id },
      { $setOnInsert: { role: invite.role, joinedAt: new Date() } },
      { upsert: true },
    );
    invite.acceptedAt = new Date();
    await invite.save();

    await logActivity({
      workspaceId: invite.workspaceId,
      actorId: user._id,
      kind: "MEMBER_JOINED",
      summary: "joined the workspace",
    });
    return ok({ workspaceId: invite.workspaceId.toString() });
  } catch (error) {
    return handleError(error);
  }
}
