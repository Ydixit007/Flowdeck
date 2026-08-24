import "server-only";
import { connectDB } from "@/lib/db";
import { Task, TaskOccurrence, type TaskDoc } from "@/models/Task";
import { User } from "@/models/User";
import { notify } from "@/server/notifications";
import { expandOccurrences } from "@/lib/recurrence";
import { formatTz, resolveTimezone, toWallClock, weekdayInTz } from "@/lib/tz";

export interface ReminderRunResult {
  starting: number;
  overdue: number;
  agendas: number;
}

const LOOKAHEAD_MS = 60 * 60 * 1000;

/**
 * Sweeps for reminders that are due now. Designed to be called every few
 * minutes by a cron job; each reminder records the occurrence it fired for so
 * repeated runs cannot double-send.
 */
export async function runReminderSweep(now = new Date()): Promise<ReminderRunResult> {
  await connectDB();
  const result: ReminderRunResult = { starting: 0, overdue: 0, agendas: 0 };

  // --- Task starting soon ---------------------------------------------------
  const candidates = await Task.find({
    status: { $in: ["TODO", "IN_PROGRESS"] },
    "reminders.0": { $exists: true },
    $or: [
      { startAt: { $gte: new Date(now.getTime() - LOOKAHEAD_MS), $lte: new Date(now.getTime() + LOOKAHEAD_MS * 24) } },
      { recurrence: { $ne: null } },
    ],
  }).lean<TaskDoc[]>();

  for (const task of candidates) {
    const recipientId = task.assigneeId ?? task.creatorId;
    const anchor = task.startAt ?? task.dueAt;
    if (!anchor) continue;
    const tz = resolveTimezone(task.scheduleTimezone);

    const occurrences = task.recurrence
      ? expandOccurrences(
          new Date(anchor),
          task.recurrence,
          { from: new Date(now.getTime() - LOOKAHEAD_MS), to: new Date(now.getTime() + LOOKAHEAD_MS * 2) },
          tz,
        )
      : [new Date(anchor)];

    for (const reminder of task.reminders) {
      for (const occurrence of occurrences) {
        const fireAt = new Date(occurrence.getTime() - reminder.minutesBefore * 60_000);
        if (fireAt > now || now.getTime() - fireAt.getTime() > 15 * 60_000) continue;
        if (
          reminder.lastSentForOccurrence &&
          new Date(reminder.lastSentForOccurrence).getTime() === occurrence.getTime()
        ) {
          continue;
        }
        // Skipped or already-completed occurrences must not nag.
        const override = await TaskOccurrence.findOne({ taskId: task._id, occurrenceStart: occurrence })
          .select("skipped status")
          .lean();
        if (override?.skipped || override?.status === "DONE" || override?.status === "CANCELLED") continue;

        await notify({
          userId: recipientId,
          workspaceId: task.workspaceId,
          kind: "TASK_STARTING",
          title: task.title,
          body:
            reminder.minutesBefore === 0
              ? `Starting now · ${formatTz(occurrence, tz, "HH:mm")}`
              : `Starts in ${reminder.minutesBefore} min · ${formatTz(occurrence, tz, "HH:mm")}`,
          url: `/tasks?task=${task._id.toString()}`,
          taskId: task._id,
        });
        await Task.updateOne(
          { _id: task._id, "reminders._id": reminder._id },
          { $set: { "reminders.$.lastSentForOccurrence": occurrence } },
        );
        result.starting += 1;
      }
    }
  }

  // --- Overdue -------------------------------------------------------------
  const overdue = await Task.find({
    status: { $in: ["TODO", "IN_PROGRESS"] },
    recurrence: null,
    dueAt: { $lt: now, $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
  })
    .select("title workspaceId assigneeId creatorId dueAt")
    .lean();

  for (const task of overdue) {
    await notify({
      userId: task.assigneeId ?? task.creatorId,
      workspaceId: task.workspaceId,
      kind: "TASK_OVERDUE",
      title: `Overdue: ${task.title}`,
      body: "This task passed its due time.",
      url: `/tasks?task=${task._id.toString()}`,
      taskId: task._id,
      // One nudge per day per task, however often the sweep runs.
      dedupeWindowMs: 24 * 60 * 60 * 1000,
    });
    result.overdue += 1;
  }

  // --- Daily agenda / weekly planning --------------------------------------
  const users = await User.find({}).select("name timezone notificationPrefs").lean();
  for (const user of users) {
    const tz = resolveTimezone(user.timezone);
    const wall = toWallClock(now, tz);
    const prefs = user.notificationPrefs;
    if (!prefs) continue;

    if (wall.hour === prefs.dailyAgendaHour && wall.minute < 15) {
      const dayStart = new Date(now);
      const count = await Task.countDocuments({
        $or: [{ assigneeId: user._id }, { creatorId: user._id }],
        status: { $in: ["TODO", "IN_PROGRESS"] },
        startAt: { $gte: dayStart, $lte: new Date(dayStart.getTime() + 86_400_000) },
      });
      await notify({
        userId: user._id,
        kind: "DAILY_AGENDA",
        title: `Good morning, ${user.name.split(" ")[0] ?? user.name}`,
        body: count > 0 ? `${count} task${count === 1 ? "" : "s"} scheduled today.` : "Nothing scheduled yet today.",
        url: "/",
        dedupeWindowMs: 20 * 60 * 60 * 1000,
      });
      result.agendas += 1;
    }

    const weekday = weekdayInTz(now, tz);
    if (weekday === prefs.weeklyPlanningWeekday && wall.hour === prefs.dailyAgendaHour && wall.minute < 15) {
      await notify({
        userId: user._id,
        kind: "WEEKLY_PLANNING",
        title: "Plan your week",
        body: "Review last week and schedule what matters next.",
        url: "/review",
        dedupeWindowMs: 6 * 24 * 60 * 60 * 1000,
      });
    }
  }

  return result;
}
