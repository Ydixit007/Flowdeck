import type { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody, parseQuery } from "@/lib/api";
import { createTaskSchema, taskQuerySchema } from "@/lib/validation";
import { requireMembership, taskVisibilityFilter } from "@/server/authz";
import { andFilters } from "@/lib/filters";
import { Task, TaskOccurrence, type TaskDoc, type TaskOccurrenceDoc } from "@/models/Task";
import { asArray, buildCalendarItems, windowQuery } from "@/server/tasks";
import { logActivity } from "@/server/activity";
import { resolveTimezone } from "@/lib/tz";
import { Project } from "@/models/Project";
import { WorkspaceMember } from "@/models/Workspace";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const query = parseQuery(request, taskQuerySchema);
    const { workspaceId } = await requireMembership(user, query.workspaceId);
    await connectDB();

    const filter: Record<string, unknown> = {
      ...taskVisibilityFilter(user, [workspaceId]),
    };

    const projectIds = asArray(query.projectId);
    if (projectIds) filter.projectId = { $in: projectIds.map((p) => new Types.ObjectId(p)) };
    const statuses = asArray(query.status);
    if (statuses) filter.status = { $in: statuses };
    const priorities = asArray(query.priority);
    if (priorities) filter.priority = { $in: priorities };
    const tagIds = asArray(query.tagId);
    if (tagIds) filter.tagIds = { $in: tagIds.map((t) => new Types.ObjectId(t)) };
    const platforms = asArray(query.platform);
    if (platforms) filter["content.platform"] = { $in: platforms };
    const contentStatuses = asArray(query.contentStatus);
    if (contentStatuses) filter["content.contentStatus"] = { $in: contentStatuses };
    if (query.isContent) filter.isContent = query.isContent === "true";
    if (query.assigneeId === "me") {
      filter.$and = [
        ...((filter.$and as unknown[]) ?? []),
        {
          $or: [{ assigneeId: user._id }, { creatorId: user._id, assigneeId: null }],
        },
      ];
    } else if (query.assigneeId === "none") {
      filter.assigneeId = null;
    } else if (query.assigneeId) {
      filter.assigneeId = new Types.ObjectId(query.assigneeId);
    }

    // Inbox mode: unscheduled items only, no occurrence expansion needed.
    if (query.unscheduled === "true") {
      const tasks = await Task.find(andFilters(filter, { startAt: null, dueAt: null }))
        .sort({ createdAt: -1 })
        .limit(query.limit ?? 200)
        .lean<TaskDoc[]>();
      return ok({ items: buildCalendarItems(tasks, [], { from: new Date(0), to: new Date(0) }, user.timezone) });
    }

    if (!query.from || !query.to) {
      const tasks = await Task.find(filter)
        .sort({ startAt: 1, createdAt: -1 })
        .limit(query.limit ?? 200)
        .lean<TaskDoc[]>();
      const window = { from: new Date(Date.now() - 86_400_000 * 30), to: new Date(Date.now() + 86_400_000 * 90) };
      const overrides = await TaskOccurrence.find({
        taskId: { $in: tasks.map((t) => t._id) },
      }).lean<TaskOccurrenceDoc[]>();
      return ok({ items: buildCalendarItems(tasks, overrides, window, user.timezone) });
    }

    const window = { from: query.from, to: query.to };
    const tasks = await Task.find(andFilters(filter, windowQuery(window, query.includeUnscheduled === "true")))
      .limit(query.limit ?? 500)
      .lean<TaskDoc[]>();
    const overrides = await TaskOccurrence.find({
      taskId: { $in: tasks.filter((t) => t.recurrence).map((t) => t._id) },
      occurrenceStart: { $gte: window.from, $lte: window.to },
    }).lean<TaskOccurrenceDoc[]>();

    return ok({ items: buildCalendarItems(tasks, overrides, window, user.timezone) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, createTaskSchema);
    const { workspaceId } = await requireMembership(user, input.workspaceId, "MEMBER");
    await connectDB();

    if (input.projectId) {
      const project = await Project.findOne({ _id: input.projectId, workspaceId }).select("_id").lean();
      if (!project) return fail("Project not found in this workspace", "NOT_FOUND", 404);
    }
    if (input.assigneeId) {
      const member = await WorkspaceMember.exists({ workspaceId, userId: input.assigneeId });
      if (!member) return fail("Assignee is not a member of this workspace", "VALIDATION_ERROR", 422);
    }
    if (input.startAt && input.dueAt && input.dueAt < input.startAt) {
      return fail("Due time cannot be before the start time", "VALIDATION_ERROR", 422);
    }

    const dueAt =
      input.dueAt ??
      (input.startAt && input.estimatedMinutes
        ? new Date(input.startAt.getTime() + input.estimatedMinutes * 60_000)
        : input.startAt && !input.allDay
          ? new Date(input.startAt.getTime() + 30 * 60_000)
          : null);

    const task = await Task.create({
      ...input,
      workspaceId,
      dueAt,
      creatorId: user._id,
      scheduleTimezone: resolveTimezone(user.timezone),
      completedAt: input.status === "DONE" ? new Date() : null,
      content: input.isContent
        ? {
            platform: input.content?.platform ?? "OTHER",
            contentType: input.content?.contentType ?? "POST",
            caption: input.content?.caption ?? null,
            body: input.content?.body ?? null,
            contentStatus: input.content?.contentStatus ?? "IDEA",
            publishAt: input.content?.publishAt ?? input.startAt ?? null,
          }
        : null,
      dev: input.dev ?? null,
      subtasks: input.subtasks.map((s, index) => ({ ...s, order: index })),
    });

    await logActivity({
      workspaceId,
      actorId: user._id,
      kind: "TASK_CREATED",
      taskId: task._id,
      projectId: task.projectId ?? null,
      summary: `created ${task.title}`,
    });

    if (task.assigneeId && !task.assigneeId.equals(user._id)) {
      const { notifyAssignment } = await import("@/server/notifications");
      await notifyAssignment(task, user);
    }

    return ok({ task: task.toObject() }, 201);
  } catch (error) {
    return handleError(error);
  }
}
