import type { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody, type RouteContext } from "@/lib/api";
import { updateTaskSchema } from "@/lib/validation";
import { requireTaskAccess } from "@/server/authz";
import { Task, TaskOccurrence, type TaskDoc } from "@/models/Task";
import { Comment } from "@/models/Social";
import { logActivity } from "@/server/activity";
import { sameValue } from "@/lib/diff";
import { WorkspaceMember } from "@/models/Workspace";
import { Project } from "@/models/Project";

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { task } = await requireTaskAccess(user, id, "read");
    await connectDB();
    const overrides = await TaskOccurrence.find({ taskId: task._id }).lean();
    return ok({ task, overrides });
  } catch (error) {
    return handleError(error);
  }
}

const SCHEDULE_FIELDS = ["startAt", "dueAt", "allDay", "recurrence"] as const;

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { task } = await requireTaskAccess(user, id, "write");
    const input = await parseBody(request, updateTaskSchema);
    await connectDB();

    if (input.projectId) {
      const project = await Project.findOne({ _id: input.projectId, workspaceId: task.workspaceId })
        .select("_id")
        .lean();
      if (!project) return fail("Project not found in this workspace", "NOT_FOUND", 404);
    }
    if (input.assigneeId) {
      const member = await WorkspaceMember.exists({ workspaceId: task.workspaceId, userId: input.assigneeId });
      if (!member) return fail("Assignee is not a member of this workspace", "VALIDATION_ERROR", 422);
    }

    const startAt = input.startAt !== undefined ? input.startAt : task.startAt;
    const dueAt = input.dueAt !== undefined ? input.dueAt : task.dueAt;
    if (startAt && dueAt && dueAt < startAt) {
      return fail("Due time cannot be before the start time", "VALIDATION_ERROR", 422);
    }

    // ---- Recurring series: scoped edits -------------------------------------
    if (task.recurrence && input.scope !== "SERIES") {
      if (!input.occurrenceStart) {
        return fail("occurrenceStart is required for scoped edits", "VALIDATION_ERROR", 422);
      }
      if (input.scope === "OCCURRENCE") {
        const override = await TaskOccurrence.findOneAndUpdate(
          { taskId: task._id, occurrenceStart: input.occurrenceStart },
          {
            $set: {
              workspaceId: task.workspaceId,
              ...(input.status !== undefined ? { status: input.status } : {}),
              ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
              ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.actualMinutes !== undefined ? { actualMinutes: input.actualMinutes } : {}),
              ...(input.status === "DONE" ? { completedAt: new Date() } : {}),
              ...(input.status && input.status !== "DONE" ? { completedAt: null } : {}),
            },
          },
          { upsert: true, new: true },
        ).lean();

        await logActivity({
          workspaceId: task.workspaceId,
          actorId: user._id,
          kind: input.status === "DONE" ? "TASK_COMPLETED" : "TASK_UPDATED",
          taskId: task._id,
          projectId: task.projectId ?? null,
          summary:
            input.status === "DONE"
              ? `completed one occurrence of ${task.title}`
              : `updated one occurrence of ${task.title}`,
        });
        return ok({ occurrence: override });
      }

      // FUTURE: end the current series the day before this occurrence and
      // create a new series carrying the edits forward.
      const splitPoint = new Date(input.occurrenceStart);
      const untilDate = new Date(splitPoint.getTime() - 1000);
      const source = await Task.findById(task._id).lean<TaskDoc | null>();
      if (!source) return fail("Task not found", "NOT_FOUND", 404);

      await Task.updateOne({ _id: task._id }, { $set: { "recurrence.until": untilDate } });

      const { _id, createdAt, updatedAt, ...rest } = source;
      const nextSeries = await Task.create({
        ...rest,
        ...stripScopeFields(input),
        startAt: input.startAt ?? splitPoint,
        dueAt: input.dueAt ?? deriveDue(source, splitPoint, input.dueAt),
        recurrence: input.recurrence ?? { ...source.recurrence, until: source.recurrence?.until ?? null },
        creatorId: user._id,
      });

      await TaskOccurrence.deleteMany({ taskId: task._id, occurrenceStart: { $gte: splitPoint } });
      await logActivity({
        workspaceId: task.workspaceId,
        actorId: user._id,
        kind: "TASK_UPDATED",
        taskId: nextSeries._id,
        projectId: nextSeries.projectId ?? null,
        summary: `updated ${task.title} from ${splitPoint.toISOString().slice(0, 10)} onward`,
      });
      return ok({ task: nextSeries.toObject(), splitFrom: task._id.toString() });
    }

    // ---- Plain task / whole series ------------------------------------------
    const update = stripScopeFields(input);
    if (input.status !== undefined) {
      update.completedAt = input.status === "DONE" ? (task.completedAt ?? new Date()) : null;
    }
    if (input.subtasks !== undefined) {
      update.subtasks = input.subtasks.map((s, index) => ({
        ...(s._id ? { _id: new Types.ObjectId(s._id) } : {}),
        title: s.title,
        done: s.done,
        order: index,
        completedAt: s.done ? new Date() : null,
      }));
    }
    if (input.isContent && input.content) {
      const existing = task.content;
      update.content = {
        platform: input.content.platform ?? existing?.platform ?? "OTHER",
        contentType: input.content.contentType ?? existing?.contentType ?? "POST",
        caption: input.content.caption ?? existing?.caption ?? null,
        body: input.content.body ?? existing?.body ?? null,
        contentStatus: input.content.contentStatus ?? existing?.contentStatus ?? "IDEA",
        publishAt: input.content.publishAt ?? existing?.publishAt ?? null,
      };
    }

    const updated = await Task.findByIdAndUpdate(task._id, { $set: update }, { new: true }).lean<TaskDoc | null>();
    if (!updated) return fail("Task not found", "NOT_FOUND", 404);

    // Only log fields whose value actually moved. Sending the current value
    // back (a re-save, a drag that lands where it started) is not history.
    const scheduleChanged = SCHEDULE_FIELDS.some(
      (f) => input[f] !== undefined && !sameValue(input[f], task[f]),
    );
    const statusChanged = input.status !== undefined && input.status !== task.status;
    const anyChanged = Object.keys(update).some(
      (key) => !sameValue(update[key], (task as unknown as Record<string, unknown>)[key]),
    );
    if (anyChanged) {
      await logActivity({
        workspaceId: task.workspaceId,
        actorId: user._id,
        kind: statusChanged
          ? input.status === "DONE"
            ? "TASK_COMPLETED"
            : "TASK_STATUS_CHANGED"
          : scheduleChanged
            ? "TASK_SCHEDULED"
            : "TASK_UPDATED",
        taskId: task._id,
        projectId: updated.projectId ?? null,
        summary: statusChanged
          ? input.status === "DONE"
            ? `completed ${updated.title}`
            : `moved ${updated.title} to ${String(input.status).toLowerCase().replace("_", " ")}`
          : scheduleChanged
            ? `rescheduled ${updated.title}`
            : `updated ${updated.title}`,
      });
    }

    if (input.assigneeId && !task.assigneeId?.equals(input.assigneeId) && !user._id.equals(input.assigneeId)) {
      const { notifyAssignment } = await import("@/server/notifications");
      await notifyAssignment(updated, user);
    }

    return ok({ task: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { task } = await requireTaskAccess(user, id, "write");
    await connectDB();

    const url = new URL(request.url);
    const occurrenceStart = url.searchParams.get("occurrenceStart");

    // Deleting one occurrence of a series records a skip instead of removing rows.
    if (task.recurrence && occurrenceStart) {
      const when = new Date(occurrenceStart);
      if (Number.isNaN(when.getTime())) return fail("Invalid occurrenceStart", "VALIDATION_ERROR", 422);
      await TaskOccurrence.findOneAndUpdate(
        { taskId: task._id, occurrenceStart: when },
        { $set: { workspaceId: task.workspaceId, skipped: true } },
        { upsert: true },
      );
      return ok({ skipped: true });
    }

    await Promise.all([
      Task.deleteOne({ _id: task._id }),
      TaskOccurrence.deleteMany({ taskId: task._id }),
      Comment.deleteMany({ taskId: task._id }),
      Task.updateMany({ dependsOnIds: task._id }, { $pull: { dependsOnIds: task._id } }),
    ]);

    await logActivity({
      workspaceId: task.workspaceId,
      actorId: user._id,
      kind: "TASK_DELETED",
      projectId: task.projectId ?? null,
      summary: `deleted ${task.title}`,
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}

type UpdateInput = Awaited<ReturnType<typeof updateTaskSchema.parseAsync>>;

/** Removes fields that control *how* the edit applies from the fields to write. */
function stripScopeFields(input: UpdateInput): Record<string, unknown> {
  const { scope: _scope, occurrenceStart: _occurrenceStart, subtasks: _subtasks, content: _content, ...rest } = input;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

function deriveDue(source: TaskDoc, newStart: Date, explicit: Date | null | undefined): Date | null {
  if (explicit !== undefined) return explicit;
  if (!source.startAt || !source.dueAt) return null;
  const duration = new Date(source.dueAt).getTime() - new Date(source.startAt).getTime();
  return new Date(newStart.getTime() + duration);
}
