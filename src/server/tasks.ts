import "server-only";
import { Types } from "mongoose";
import { Task, TaskOccurrence, type TaskDoc, type TaskOccurrenceDoc } from "@/models/Task";
import { expandOccurrences } from "@/lib/recurrence";
import { resolveTimezone } from "@/lib/tz";
import type { TaskStatus } from "@/lib/types";

/** A single renderable item on the calendar: either a plain task or one
 *  generated occurrence of a recurring series. */
export interface CalendarItem {
  id: string;
  taskId: string;
  occurrenceStart: string | null;
  isOccurrence: boolean;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskDoc["priority"];
  projectId: string | null;
  tagIds: string[];
  assigneeId: string | null;
  creatorId: string;
  startAt: string | null;
  dueAt: string | null;
  allDay: boolean;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  visibility: TaskDoc["visibility"];
  isContent: boolean;
  content: TaskDoc["content"] | null;
  dev: TaskDoc["dev"] | null;
  recurrence: TaskDoc["recurrence"] | null;
  subtaskTotal: number;
  subtaskDone: number;
  isRecurring: boolean;
  completedAt: string | null;
}

const iso = (value?: Date | null): string | null => (value ? new Date(value).toISOString() : null);

function baseItem(task: TaskDoc): CalendarItem {
  return {
    id: task._id.toString(),
    taskId: task._id.toString(),
    occurrenceStart: null,
    isOccurrence: false,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    projectId: task.projectId?.toString() ?? null,
    tagIds: (task.tagIds ?? []).map((t) => t.toString()),
    assigneeId: task.assigneeId?.toString() ?? null,
    creatorId: task.creatorId.toString(),
    startAt: iso(task.startAt),
    dueAt: iso(task.dueAt),
    allDay: task.allDay,
    estimatedMinutes: task.estimatedMinutes ?? null,
    actualMinutes: task.actualMinutes ?? null,
    visibility: task.visibility,
    isContent: task.isContent,
    content: task.content ?? null,
    dev: task.dev ?? null,
    recurrence: task.recurrence ?? null,
    subtaskTotal: task.subtasks?.length ?? 0,
    subtaskDone: (task.subtasks ?? []).filter((s) => s.done).length,
    isRecurring: Boolean(task.recurrence),
    completedAt: iso(task.completedAt),
  };
}

export function occurrenceKey(taskId: string, occurrenceStart: Date): string {
  return `${taskId}:${occurrenceStart.toISOString()}`;
}

/**
 * Turns stored tasks into calendar items for a window. Non-recurring tasks pass
 * through; recurring ones are expanded and merged with any stored per-occurrence
 * overrides (completion, reschedule, skip, edited title).
 */
export function buildCalendarItems(
  tasks: TaskDoc[],
  overrides: TaskOccurrenceDoc[],
  window: { from: Date; to: Date },
  fallbackTimezone: string,
): CalendarItem[] {
  const overrideMap = new Map<string, TaskOccurrenceDoc>();
  for (const o of overrides) overrideMap.set(occurrenceKey(o.taskId.toString(), new Date(o.occurrenceStart)), o);

  const items: CalendarItem[] = [];

  for (const task of tasks) {
    if (!task.recurrence) {
      items.push(baseItem(task));
      continue;
    }
    const anchor = task.startAt ?? task.dueAt;
    if (!anchor) {
      items.push(baseItem(task));
      continue;
    }
    const tz = resolveTimezone(task.scheduleTimezone ?? fallbackTimezone);
    const durationMs =
      task.startAt && task.dueAt ? new Date(task.dueAt).getTime() - new Date(task.startAt).getTime() : null;

    for (const start of expandOccurrences(new Date(anchor), task.recurrence, window, tz)) {
      const key = occurrenceKey(task._id.toString(), start);
      const override = overrideMap.get(key);
      if (override?.skipped) continue;
      const item = baseItem(task);
      item.id = key;
      item.occurrenceStart = start.toISOString();
      item.isOccurrence = true;
      item.startAt = (override?.startAt ? new Date(override.startAt) : start).toISOString();
      const effectiveStart = new Date(item.startAt);
      item.dueAt = override?.dueAt
        ? new Date(override.dueAt).toISOString()
        : durationMs !== null
          ? new Date(effectiveStart.getTime() + durationMs).toISOString()
          : null;
      if (override?.status) item.status = override.status;
      if (override?.title) item.title = override.title;
      if (override?.description) item.description = override.description;
      if (override?.actualMinutes != null) item.actualMinutes = override.actualMinutes;
      item.completedAt = iso(override?.completedAt ?? null);
      items.push(item);
    }
  }

  return items.sort((a, b) => {
    const at = a.startAt ?? a.dueAt ?? "";
    const bt = b.startAt ?? b.dueAt ?? "";
    if (at === bt) return a.title.localeCompare(b.title);
    if (!at) return 1;
    if (!bt) return -1;
    return at < bt ? -1 : 1;
  });
}

/** Tasks that may produce items in the window: either directly scheduled inside
 *  it, or a recurring series that started before the window ends. */
export function windowQuery(window: { from: Date; to: Date }, includeUnscheduled = false) {
  const clauses: Record<string, unknown>[] = [
    { startAt: { $gte: window.from, $lte: window.to } },
    { dueAt: { $gte: window.from, $lte: window.to } },
    // Long tasks spanning the window.
    { startAt: { $lt: window.from }, dueAt: { $gt: window.to } },
    // Recurring series anchored before the window end.
    { recurrence: { $ne: null }, startAt: { $lte: window.to } },
    { recurrence: { $ne: null }, startAt: null, dueAt: { $lte: window.to } },
  ];
  if (includeUnscheduled) {
    clauses.push({ startAt: null, dueAt: null });
  }
  return {
    $and: [{ $or: clauses }],
  };
}

export function toObjectIds(values: string[] | undefined): Types.ObjectId[] | undefined {
  if (!values || values.length === 0) return undefined;
  return values.map((v) => new Types.ObjectId(v));
}

export const asArray = <T,>(value: T | T[] | undefined): T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];
