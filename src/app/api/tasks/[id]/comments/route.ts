import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody, type RouteContext } from "@/lib/api";
import { createCommentSchema } from "@/lib/validation";
import { requireTaskAccess } from "@/server/authz";
import { Comment } from "@/models/Social";
import { User } from "@/models/User";
import { WorkspaceMember } from "@/models/Workspace";
import { logActivity } from "@/server/activity";
import { notifyMentions } from "@/server/notifications";
import { fetchUserRefs } from "@/server/users";

const MENTION_PATTERN = /@([a-z0-9_.-]{3,32})/gi;

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { task } = await requireTaskAccess(user, id, "read");
    await connectDB();
    const comments = await Comment.find({ taskId: task._id }).sort({ createdAt: 1 }).lean();
    const authors = await fetchUserRefs(comments.map((c) => c.authorId));
    return ok({ comments, authors });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { task } = await requireTaskAccess(user, id, "read");
    const { body } = await parseBody(request, createCommentSchema);
    await connectDB();

    // Resolve @mentions to workspace members only; unknown handles stay plain text.
    const handles = [...new Set([...body.matchAll(MENTION_PATTERN)].map((m) => m[1]?.toLowerCase() ?? ""))].filter(Boolean);
    let mentionIds: (typeof user)["_id"][] = [];
    if (handles.length > 0) {
      const candidates = await User.find({ username: { $in: handles } }).select("_id").lean();
      const memberships = await WorkspaceMember.find({
        workspaceId: task.workspaceId,
        userId: { $in: candidates.map((c) => c._id) },
      })
        .select("userId")
        .lean();
      mentionIds = memberships.map((m) => m.userId);
    }

    const comment = await Comment.create({
      taskId: task._id,
      workspaceId: task.workspaceId,
      authorId: user._id,
      body,
      mentionIds,
    });

    await logActivity({
      workspaceId: task.workspaceId,
      actorId: user._id,
      kind: "COMMENT_ADDED",
      taskId: task._id,
      projectId: task.projectId ?? null,
      summary: `commented on ${task.title}`,
    });

    await notifyMentions(mentionIds, user, task, body);

    // Notify the assignee (when it is not the commenter and not already mentioned).
    if (
      task.assigneeId &&
      !task.assigneeId.equals(user._id) &&
      !mentionIds.some((m) => m.equals(task.assigneeId!))
    ) {
      const { notify } = await import("@/server/notifications");
      await notify({
        userId: task.assigneeId,
        workspaceId: task.workspaceId,
        kind: "COMMENT",
        title: `${user.name} commented on ${task.title}`,
        body: body.slice(0, 140),
        url: `/tasks?task=${task._id.toString()}`,
        taskId: task._id,
      });
    }

    return ok({ comment: comment.toObject() }, 201);
  } catch (error) {
    return handleError(error);
  }
}
