"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { GripHorizontal, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import type { CalendarItem } from "@/server/tasks";
import { Avatar } from "@/components/ui/avatar";
import { PLATFORM_META, PriorityIcon, StatusIcon, priorityRailClass } from "@/components/tasks/task-meta";

interface TaskBlockProps {
  item: CalendarItem;
  variant: "block" | "chip" | "row";
  timeZone?: string;
  onClick: () => void;
  onToggleStatus: () => void;
  onPointerDownDrag?: (event: React.PointerEvent) => void;
  onPointerDownResize?: (event: React.PointerEvent) => void;
  hideProject?: boolean;
}

export function formatTimeRange(
  item: {
    startAt?: string | null;
    dueAt?: string | null;
    allDay?: boolean;
    estimatedMinutes?: number | null;
  },
  timeZone: string,
): { timeLabel: string | null; fullTimeLabel: string | null } {
  if (item.allDay) {
    if (!item.startAt) return { timeLabel: "All day", fullTimeLabel: "All day" };
    const startDate = formatInTimeZone(new Date(item.startAt), timeZone, "d MMM");
    if (!item.dueAt) return { timeLabel: "All day", fullTimeLabel: "All day" };
    const endDate = formatInTimeZone(new Date(item.dueAt), timeZone, "d MMM");
    const label = startDate === endDate ? "All day" : `All day (${startDate} – ${endDate})`;
    return { timeLabel: label, fullTimeLabel: label };
  }

  if (!item.startAt) {
    if (item.dueAt) {
      const due = formatInTimeZone(new Date(item.dueAt), timeZone, "HH:mm");
      return { timeLabel: `Ends ${due}`, fullTimeLabel: `Ends at ${due}` };
    }
    return { timeLabel: null, fullTimeLabel: null };
  }

  const start = new Date(item.startAt);
  const startTime = formatInTimeZone(start, timeZone, "HH:mm");

  const end = item.dueAt
    ? new Date(item.dueAt)
    : item.estimatedMinutes && item.estimatedMinutes > 0
      ? new Date(start.getTime() + item.estimatedMinutes * 60_000)
      : new Date(start.getTime() + 30 * 60_000);

  if (end.getTime() <= start.getTime()) {
    return { timeLabel: startTime, fullTimeLabel: `at ${startTime}` };
  }

  const sameDay =
    formatInTimeZone(start, timeZone, "yyyy-MM-dd") === formatInTimeZone(end, timeZone, "yyyy-MM-dd");
  const endTime = sameDay
    ? formatInTimeZone(end, timeZone, "HH:mm")
    : formatInTimeZone(end, timeZone, "d MMM HH:mm");

  const timeLabel = `${startTime} – ${endTime}`;
  const fullTimeLabel = sameDay
    ? `${startTime} to ${endTime}`
    : `${startTime} to ${formatInTimeZone(end, timeZone, "MMMM d, HH:mm")}`;

  return { timeLabel, fullTimeLabel };
}

export function TaskBlock({
  item,
  variant,
  timeZone = "UTC",
  onClick,
  onToggleStatus,
  onPointerDownDrag,
  onPointerDownResize,
  hideProject = false,
}: TaskBlockProps) {
  const { projects, members, user } = useApp();
  const project = item.projectId ? projects.find((p) => p.id === item.projectId) : undefined;
  const accent = item.isContent
    ? PLATFORM_META[item.content?.platform ?? "OTHER"].color
    : (project?.color ?? undefined);
  const done = item.status === "DONE";
  const cancelled = item.status === "CANCELLED";

  const assignee = React.useMemo(() => {
    if (!item.assigneeId) return null;
    if (user && item.assigneeId === user.id) return user;
    return members.find((m) => m.id === item.assigneeId) ?? { name: "Assigned", avatar: null };
  }, [item.assigneeId, members, user]);

  const { timeLabel, fullTimeLabel } = React.useMemo(
    () => formatTimeRange(item, timeZone),
    [item.startAt, item.dueAt, item.allDay, item.estimatedMinutes, timeZone],
  );

  const multiDayLabel = React.useMemo(() => {
    if (!item.allDay || !item.startAt || !item.dueAt) return null;
    const startDay = formatInTimeZone(new Date(item.startAt), timeZone, "d MMM");
    const endDay = formatInTimeZone(new Date(item.dueAt), timeZone, "d MMM");
    return startDay === endDay ? null : `${startDay} – ${endDay}`;
  }, [item.allDay, item.startAt, item.dueAt, timeZone]);

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${item.title}${timeLabel ? ` (${timeLabel})` : ""}${assignee ? ` · ${assignee.name}` : ""}`}
        aria-label={`${item.title}${fullTimeLabel ? ` (${fullTimeLabel})` : ""}${assignee ? ` assigned to ${assignee.name}` : ""}`}
        className={cn(
          "flex w-full items-center gap-1.5 truncate rounded-[5px] border-l-2 bg-surface-raised px-1.5 py-1 text-left text-[11px] font-medium transition-colors hover:bg-muted",
          done && "opacity-60",
        )}
        style={{ borderLeftColor: accent ?? "var(--border-strong)" }}
      >
        {item.isRecurring ? <Repeat className="size-2.5 shrink-0 text-muted-foreground" /> : null}
        <span className={cn("min-w-0 flex-1 truncate", done && "line-through")}>
          {!item.allDay && timeLabel ? (
            <span className="mr-1 text-[10px] tabular-nums text-muted-foreground">{timeLabel}</span>
          ) : multiDayLabel ? (
            <span className="mr-1 text-[10px] tabular-nums font-semibold text-muted-foreground">{multiDayLabel}</span>
          ) : null}
          {item.title}
        </span>
        {assignee ? (
          <span className="ml-auto flex shrink-0 items-center gap-1 pl-1 text-[9.5px] text-muted-foreground">
            <Avatar name={assignee.name} src={assignee.avatar} size="xxs" />
            <span className="max-w-[55px] truncate font-medium leading-none">{assignee.name}</span>
          </span>
        ) : null}
      </button>
    );
  }

  if (variant === "row") {
    return (
      <div
        className={cn(
          "group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong",
          done && "opacity-70",
        )}
      >
        <button
          type="button"
          onClick={onToggleStatus}
          aria-label={done ? `Mark ${item.title} as not done` : `Mark ${item.title} as done`}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatusIcon status={item.status} />
        </button>
        <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[13px] font-medium",
                (done || cancelled) && "text-muted-foreground line-through",
              )}
            >
              {item.title}
            </span>
            <PriorityIcon priority={item.priority} />
            {item.isRecurring ? <Repeat className="size-3 shrink-0 text-muted-foreground" /> : null}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {timeLabel ? <span className="shrink-0 tabular-nums">{timeLabel}</span> : null}
            {!hideProject && project ? (
              <span className="flex shrink-0 items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: project.color }} />
                <span className="max-w-[120px] truncate">{project.name}</span>
              </span>
            ) : null}
            {item.subtaskTotal > 0 ? (
              <span className="shrink-0 tabular-nums">
                {item.subtaskDone}/{item.subtaskTotal}
              </span>
            ) : null}
            {item.isContent && item.content ? (
              <span className="shrink-0" style={{ color: PLATFORM_META[item.content.platform].color }}>
                {PLATFORM_META[item.content.platform].label}
              </span>
            ) : null}
          </span>
        </button>
        {assignee ? (
          <div
            title={`Assigned to ${assignee.name}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted/60 py-0.5 pl-1 pr-2 text-[11px] text-muted-foreground transition-colors group-hover:bg-muted"
          >
            <Avatar name={assignee.name} src={assignee.avatar} size="xs" />
            <span className="max-w-[80px] sm:max-w-[100px] truncate font-medium">{assignee.name}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface-raised pl-2 pr-1.5 py-1 text-left transition-shadow hover:fd-elevated",
        done && "opacity-65",
        onPointerDownDrag && "cursor-grab active:cursor-grabbing touch-none",
      )}
      onPointerDown={onPointerDownDrag}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      title={`${item.title}${timeLabel ? ` (${timeLabel})` : ""}${assignee ? ` · ${assignee.name}` : ""}`}
      aria-label={`${item.title}${fullTimeLabel ? ` (${fullTimeLabel})` : ""}${assignee ? ` assigned to ${assignee.name}` : ""}`}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1 rounded-l", !accent && priorityRailClass(item.priority))}
        style={accent ? { background: accent } : undefined}
      />
      <span className="flex min-w-0 items-center gap-1">
        {item.isRecurring ? <Repeat className="size-2.5 shrink-0 text-muted-foreground" /> : null}
        <span
          className={cn(
            "truncate text-[11.5px] font-semibold leading-tight",
            done && "line-through text-muted-foreground",
          )}
        >
          {item.title}
        </span>
      </span>
      {timeLabel ? (
        <span className="truncate text-[10px] tabular-nums text-muted-foreground">{timeLabel}</span>
      ) : null}

      {assignee ? (
        <div className="mt-auto flex min-w-0 items-center gap-1 pt-0.5 text-[10px] text-muted-foreground">
          <Avatar name={assignee.name} src={assignee.avatar} size="xxs" />
          <span className="truncate font-medium leading-none">{assignee.name}</span>
        </div>
      ) : null}

      {onPointerDownResize ? (
        <span
          onPointerDown={onPointerDownResize}
          role="separator"
          aria-label="Resize task"
          className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize touch-none items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
        >
          <GripHorizontal className="size-3 text-muted-foreground" />
        </span>
      ) : null}
    </div>
  );
}
