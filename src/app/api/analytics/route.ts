import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseQuery } from "@/lib/api";
import { objectId } from "@/lib/validation";
import { requireMembership, taskVisibilityFilter } from "@/server/authz";
import { Task, TaskOccurrence, type TaskDoc } from "@/models/Task";
import { Project } from "@/models/Project";
import { buildCalendarItems } from "@/server/tasks";
import { addDaysInTz, formatTz, resolveTimezone, startOfDayInTz } from "@/lib/tz";

const querySchema = z.object({
  workspaceId: objectId,
  days: z.coerce.number().int().min(7).max(180).optional(),
});

export interface AnalyticsPayload {
  range: { from: string; to: string; days: number };
  totals: {
    completed: number;
    created: number;
    open: number;
    overdue: number;
    completionRate: number;
    estimatedMinutes: number;
    actualMinutes: number;
  };
  perDay: Array<{ date: string; completed: number; scheduled: number }>;
  byProject: Array<{ projectId: string | null; name: string; color: string; total: number; done: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byPlatform: Array<{ platform: string; count: number }>;
  weeklyTrend: Array<{ week: string; completed: number }>;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const query = parseQuery(request, querySchema);
    const { workspaceId } = await requireMembership(user, query.workspaceId);
    await connectDB();

    const tz = resolveTimezone(user.timezone);
    const days = query.days ?? 30;
    const now = new Date();
    const from = startOfDayInTz(addDaysInTz(now, -(days - 1), tz), tz);
    const to = addDaysInTz(startOfDayInTz(now, tz), 1, tz);

    const visible = taskVisibilityFilter(user, [workspaceId]);
    const tasks = await Task.find(visible).lean<TaskDoc[]>();
    const overrides = await TaskOccurrence.find({
      workspaceId,
      occurrenceStart: { $gte: from, $lte: to },
    }).lean();

    const items = buildCalendarItems(tasks, overrides, { from, to }, tz);

    const dayKeys: string[] = [];
    for (let i = 0; i < days; i += 1) {
      dayKeys.push(formatTz(addDaysInTz(from, i, tz), tz, "yyyy-MM-dd"));
    }
    const perDayMap = new Map(dayKeys.map((d) => [d, { completed: 0, scheduled: 0 }]));

    let completed = 0;
    let overdue = 0;
    let open = 0;
    let estimatedMinutes = 0;
    let actualMinutes = 0;

    for (const item of items) {
      const when = item.completedAt ?? item.startAt ?? item.dueAt;
      const key = when ? formatTz(new Date(when), tz, "yyyy-MM-dd") : null;
      const bucket = key ? perDayMap.get(key) : undefined;
      if (item.status === "DONE") {
        completed += 1;
        if (bucket) bucket.completed += 1;
        actualMinutes += item.actualMinutes ?? 0;
      } else if (item.status !== "CANCELLED") {
        open += 1;
        if (item.dueAt && new Date(item.dueAt) < now) overdue += 1;
      }
      if (bucket) bucket.scheduled += 1;
      estimatedMinutes += item.estimatedMinutes ?? 0;
    }

    const created = tasks.filter((t) => new Date(t.createdAt) >= from).length;

    const projects = await Project.find({ workspaceId }).select("name color").lean();
    const projectMeta = new Map(projects.map((p) => [p._id.toString(), p]));
    const byProjectMap = new Map<string, { total: number; done: number }>();
    for (const item of items) {
      const key = item.projectId ?? "none";
      const entry = byProjectMap.get(key) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (item.status === "DONE") entry.done += 1;
      byProjectMap.set(key, entry);
    }

    const byPriorityMap = new Map<string, number>();
    const byPlatformMap = new Map<string, number>();
    for (const item of items) {
      byPriorityMap.set(item.priority, (byPriorityMap.get(item.priority) ?? 0) + 1);
      if (item.isContent && item.content?.platform) {
        byPlatformMap.set(item.content.platform, (byPlatformMap.get(item.content.platform) ?? 0) + 1);
      }
    }

    const weeklyMap = new Map<string, number>();
    for (const key of dayKeys) {
      const week = formatTz(new Date(`${key}T12:00:00Z`), tz, "yyyy-'W'II");
      weeklyMap.set(week, (weeklyMap.get(week) ?? 0) + (perDayMap.get(key)?.completed ?? 0));
    }

    const payload: AnalyticsPayload = {
      range: { from: from.toISOString(), to: to.toISOString(), days },
      totals: {
        completed,
        created,
        open,
        overdue,
        completionRate: completed + open > 0 ? Math.round((completed / (completed + open)) * 100) : 0,
        estimatedMinutes,
        actualMinutes,
      },
      perDay: dayKeys.map((date) => ({
        date,
        completed: perDayMap.get(date)?.completed ?? 0,
        scheduled: perDayMap.get(date)?.scheduled ?? 0,
      })),
      byProject: [...byProjectMap.entries()].map(([key, value]) => ({
        projectId: key === "none" ? null : key,
        name: key === "none" ? "No project" : (projectMeta.get(key)?.name ?? "Unknown"),
        color: key === "none" ? "#94a3b8" : (projectMeta.get(key)?.color ?? "#6366f1"),
        total: value.total,
        done: value.done,
      })),
      byPriority: [...byPriorityMap.entries()].map(([priority, count]) => ({ priority, count })),
      byPlatform: [...byPlatformMap.entries()].map(([platform, count]) => ({ platform, count })),
      weeklyTrend: [...weeklyMap.entries()].map(([week, completedCount]) => ({ week, completed: completedCount })),
    };

    return ok(payload);
  } catch (error) {
    return handleError(error);
  }
}
