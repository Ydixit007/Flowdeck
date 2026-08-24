"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { GripHorizontal, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import type { CalendarItem } from "@/server/tasks";
import { PLATFORM_META, PriorityIcon, StatusIcon, priorityRailClass } from "@/components/tasks/task-meta";

interface TaskBlockProps {
  item: CalendarItem;
  variant: "block" | "chip" | "row";
  timeZone?: string;
  onClick: () => void;
  onToggleStatus: () => void;
  onPointerDownDrag?: (event: React.PointerEvent) => void;
  onPointerDownResize?: (event: React.PointerEvent) => void;
}

export function TaskBlock({
  item,
  variant,
  timeZone = "UTC",
  onClick,
  onToggleStatus,
  onPointerDownDrag,
  onPointerDownResize,
}: TaskBlockProps) {
  const { projects } = useApp();
  const project = item.projectId ? projects.find((p) => p.id === item.projectId) : undefined;
  const accent = item.isContent
    ? PLATFORM_META[item.content?.platform ?? "OTHER"].color
    : (project?.color ?? undefined);
  const done = item.status === "DONE";
  const cancelled = item.status === "CANCELLED";

  const timeLabel = item.startAt && !item.allDay ? formatInTimeZone(new Date(item.startAt), timeZone, "HH:mm") : null;

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-1.5 truncate rounded-[5px] border-l-2 bg-surface-raised px-1.5 py-1 text-left text-[11px] font-medium transition-colors hover:bg-muted",
          done && "opacity-60",
        )}
        style={{ borderLeftColor: accent ?? "var(--border-strong)" }}
      >
        {item.isRecurring ? <Repeat className="size-2.5 shrink-0 text-muted-foreground" /> : null}
        <span className={cn("truncate", done && "line-through")}>{item.title}</span>
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
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {timeLabel ? <span className="tabular-nums">{timeLabel}</span> : null}
            {item.allDay && item.startAt ? <span>All day</span> : null}
            {project ? (
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: project.color }} />
                {project.name}
              </span>
            ) : null}
            {item.subtaskTotal > 0 ? (
              <span className="tabular-nums">
                {item.subtaskDone}/{item.subtaskTotal}
              </span>
            ) : null}
            {item.isContent && item.content ? (
              <span style={{ color: PLATFORM_META[item.content.platform].color }}>
                {PLATFORM_META[item.content.platform].label}
              </span>
            ) : null}
          </span>
        </button>
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
      aria-label={`${item.title}${timeLabel ? ` at ${timeLabel}` : ""}`}
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
