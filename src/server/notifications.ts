import "server-only";
import webpush from "web-push";
import type { Types } from "mongoose";
import { Notification, PushSubscription } from "@/models/Social";
import { User, defaultNotificationPrefs, type NotificationPrefs } from "@/models/User";
import type { AuthUser } from "@/lib/auth";
import type { TaskDoc } from "@/models/Task";
import type { NotificationKind } from "@/lib/types";
import { toWallClock } from "@/lib/tz";

let vapidReady: boolean | null = null;

function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    vapidReady = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", publicKey, privateKey);
  vapidReady = true;
  return true;
}

export interface NotifyInput {
  userId: Types.ObjectId;
  workspaceId?: Types.ObjectId | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  url?: string | null;
  taskId?: Types.ObjectId | null;
  /**
   * Suppress this notification when an identical (user, kind, task) one was
   * already sent inside this many milliseconds. Recurring sweeps (overdue,
   * daily agenda) rely on it so a cron running every few minutes cannot spam.
   */
  dedupeWindowMs?: number;
}

function inQuietHours(prefs: NotificationPrefs, timezone: string): boolean {
  if (!prefs.quietHours?.enabled) return false;
  const { hour } = toWallClock(new Date(), timezone);
  const { startHour, endHour } = prefs.quietHours;
  // Windows that wrap midnight (22 -> 7) are handled by the OR branch.
  return startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

/** Writes the in-app record and pushes to every registered device, honouring
 *  the recipient's per-kind preferences and quiet hours. */
export async function notify(input: NotifyInput): Promise<void> {
  const recipient = await User.findById(input.userId).select("notificationPrefs timezone").lean();
  if (!recipient) return;
  const prefs = recipient.notificationPrefs ?? defaultNotificationPrefs();
  if (prefs.kinds?.[input.kind] === false) return;

  if (input.dedupeWindowMs) {
    const since = new Date(Date.now() - input.dedupeWindowMs);
    const duplicate = await Notification.exists({
      userId: input.userId,
      kind: input.kind,
      taskId: input.taskId ?? null,
      createdAt: { $gte: since },
    });
    if (duplicate) return;
  }

  if (prefs.channels?.inApp !== false) {
    await Notification.create({
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      url: input.url ?? null,
      taskId: input.taskId ?? null,
    });
  }

  if (prefs.channels?.push === false) return;
  if (inQuietHours(prefs, recipient.timezone ?? "UTC")) return;
  if (!ensureVapid()) return;

  const subs = await PushSubscription.find({ userId: input.userId }).lean();
  const payload = JSON.stringify({
    title: input.title,
    body: input.body ?? "",
    url: input.url ?? "/",
    kind: input.kind,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the browser dropped the subscription; clean it up.
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error("[push] send failed", status, (error as Error).message);
        }
      }
    }),
  );
}

export async function notifyAssignment(task: TaskDoc, actor: AuthUser): Promise<void> {
  if (!task.assigneeId) return;
  await notify({
    userId: task.assigneeId,
    workspaceId: task.workspaceId,
    kind: "TASK_ASSIGNED",
    title: `${actor.name} assigned you a task`,
    body: task.title,
    url: `/tasks?task=${task._id.toString()}`,
    taskId: task._id,
  });
}

export async function notifyMentions(
  mentionIds: Types.ObjectId[],
  actor: AuthUser,
  task: Pick<TaskDoc, "_id" | "title" | "workspaceId">,
  snippet: string,
): Promise<void> {
  await Promise.all(
    mentionIds
      .filter((id) => !id.equals(actor._id))
      .map((id) =>
        notify({
          userId: id,
          workspaceId: task.workspaceId,
          kind: "MENTION",
          title: `${actor.name} mentioned you`,
          body: snippet.slice(0, 140),
          url: `/tasks?task=${task._id.toString()}`,
          taskId: task._id,
        }),
      ),
  );
}
