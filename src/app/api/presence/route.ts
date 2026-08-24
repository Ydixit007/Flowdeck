import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody, parseQuery } from "@/lib/api";
import { presenceSchema } from "@/lib/validation";
import { objectId } from "@/lib/validation";
import { z } from "zod";
import { requireMembership, taskVisibilityFilter } from "@/server/authz";
import { User } from "@/models/User";
import { WorkspaceMember } from "@/models/Workspace";
import { Task } from "@/models/Task";
import { fetchUserRefs } from "@/server/users";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Heartbeat: records that the user is active and, optionally, which task they
 *  have explicitly marked as what they are working on. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, presenceSchema);
    await requireMembership(user, input.workspaceId);
    await connectDB();
    await User.updateOne(
      { _id: user._id },
      { $set: { lastSeenAt: new Date(), ...(input.activeTaskId !== undefined ? { activeTaskId: input.activeTaskId } : {}) } },
    );
    return ok({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { workspaceId } = parseQuery(request, z.object({ workspaceId: objectId }));
    const membership = await requireMembership(user, workspaceId);
    await connectDB();

    const members = await WorkspaceMember.find({ workspaceId: membership.workspaceId }).select("userId").lean();
    const refs = await fetchUserRefs(members.map((m) => m.userId));

    const activeTaskIds = refs.map((r) => r.activeTaskId).filter((v): v is string => Boolean(v));
    const tasks = activeTaskIds.length
      ? await Task.find({
          _id: { $in: activeTaskIds },
          ...taskVisibilityFilter(user, [membership.workspaceId]),
        })
          .select("title projectId")
          .lean()
      : [];
    const titleById = new Map(tasks.map((t) => [t._id.toString(), t.title]));

    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    return ok({
      presence: refs.map((r) => ({
        ...r,
        online: r.lastSeenAt ? new Date(r.lastSeenAt).getTime() > cutoff : false,
        // Private tasks resolve to null, so presence never leaks a hidden title.
        activeTaskTitle: r.activeTaskId ? (titleById.get(r.activeTaskId) ?? null) : null,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
