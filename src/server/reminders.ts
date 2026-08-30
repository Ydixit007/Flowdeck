import "server-only";
import { Task, TaskOccurrence, type TaskDoc } from "@/models/Task";
import { connectDB } from "@/lib/db";
import type { AuthUser } from "@/lib/auth";
import { notify } from "@/server/notifications";
import { expandOccurrences } from "@/lib/recurrence";
import { formatTz, resolveTimezone } from "@/lib/tz";
import { shouldFire, REMINDER_GRACE_MS } from "@/lib/reminder-window";
import { occurrenceKey } from "@/server/tasks";

export interface ReminderRunResult {
  starting: number;
  due: number;
  overdue: number;
}

const GRACE_MS = REMINDER_GRACE_MS;
const LOOKAHEAD_MS = 60 * 60 * 1000;
const OVERDUE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const OPEN = { $in: ["TODO", "IN_PROGRESS"] as const };
const MAX_TASKS = 200;

/** Occurrence starts that must not nag: skipped, done or cancelled. */
async function silencedKeys(tasks: TaskDoc[]): Promise<Set<string>> {
  if (tasks.length === 0) return new Set();
  const overrides = await TaskOccurrence.find({
    taskId: { $in: tasks.map((t) => t._id) },
    $or: [{ skipped: true }, { status: { $in: ["DONE", "CANCELLED"] } }],
  })
    .select("taskId occurrenceStart")
    .lean();
  return new Set(overrides.map((o) => occurrenceKey(o.taskId.toString(), new Date(o.occurrenceStart))));
}

/**
 * Sends the time-based reminders this user is owed right now. Called by the
 * client poll, so it is scoped to one user rather than sweeping everybody.
 * Every send is deduped, so polling often cannot double-notify.
 */
export async function runRemindersForUser(user: AuthUser, now = new Date()): Promise<ReminderRunResult> {
  await connectDB();
  const result: ReminderRunResult = { starting: 0, due: 0, overdue: 0 };

  // Only what is assigned to this user: the creator already gets an assignment
  // notification and should not be nagged about someone else's schedule.
  const mine = { assigneeId: user._id, status: OPEN };
  const earliest = new Date(now.getTime() - GRACE_MS);
  const latest = new Date(now.getTime() + LOOKAHEAD_MS);

  // --- Starting now --------------------------------------------------------
  const starting = await Task.find({
    ...mine,
    $or: [
      { recurrence: null, startAt: { $gte: earliest, $lte: latest } },
      // A series can only produce an occurrence now if it began before then.
      { recurrence: { $ne: null }, startAt: { $lte: latest } },
    ],
  })
    .limit(MAX_TASKS)
    .lean<TaskDoc[]>();

  const silenced = await silencedKeys(starting.filter((t) => t.recurrence));

  for (const task of starting) {
    const anchor = task.startAt ?? task.dueAt;
    if (!anchor) continue;
    const tz = resolveTimezone(task.scheduleTimezone);
    const occurrences = task.recurrence
      ? expandOccurrences(new Date(anchor), task.recurrence, { from: earliest, to: latest }, tz)
      : [new Date(anchor)];

    for (const occurrence of occurrences) {
      if (!shouldFire(occurrence, now)) continue;
      if (silenced.has(occurrenceKey(task._id.toString(), occurrence))) continue;

      await notify({
        userId: user._id,
        workspaceId: task.workspaceId,
        kind: "TASK_STARTING",
        title: task.title,
        body: `Starting now · ${formatTz(occurrence, tz, "HH:mm")}`,
        url: `/tasks?task=${task._id.toString()}`,
        taskId: task._id,
        // Keyed to the occurrence: a repeat only re-fires next occurrence.
        dedupeWindowMs: GRACE_MS + 60_000,
      });
      result.starting += 1;
    }
  }

  // --- Due now, then overdue -----------------------------------------------
  const deadlines: Array<{
    kind: "DEADLINE" | "TASK_OVERDUE";
    range: { $gte: Date; $lte?: Date; $lt?: Date };
    dedupeWindowMs: number;
    counter: "due" | "overdue";
  }> = [
    { kind: "DEADLINE", range: { $gte: earliest, $lte: now }, dedupeWindowMs: 12 * 60 * 60 * 1000, counter: "due" },
    {
      kind: "TASK_OVERDUE",
      range: { $gte: new Date(now.getTime() - OVERDUE_LOOKBACK_MS), $lt: earliest },
      // One nudge per day per task, however often the client polls.
      dedupeWindowMs: OVERDUE_LOOKBACK_MS,
      counter: "overdue",
    },
  ];

  for (const rule of deadlines) {
    const tasks = await Task.find({ ...mine, recurrence: null, dueAt: rule.range })
      .select("title workspaceId dueAt scheduleTimezone")
      .limit(MAX_TASKS)
      .lean();

    for (const task of tasks) {
      await notify({
        userId: user._id,
        workspaceId: task.workspaceId,
        kind: rule.kind,
        title: rule.kind === "DEADLINE" ? `Due now: ${task.title}` : `Overdue: ${task.title}`,
        body: task.dueAt
          ? formatTz(new Date(task.dueAt), resolveTimezone(task.scheduleTimezone), "HH:mm")
          : null,
        url: `/tasks?task=${task._id.toString()}`,
        taskId: task._id,
        dedupeWindowMs: rule.dedupeWindowMs,
      });
      result[rule.counter] += 1;
    }
  }

  return result;
}
