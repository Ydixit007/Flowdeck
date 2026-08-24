"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/server/tasks";
import { dayKey, isToday } from "@/components/calendar/range";
import { TaskBlock } from "@/components/calendar/task-block";

const MAX_VISIBLE = 3;

export function MonthGrid({
  days,
  items,
  timeZone,
  anchorMonth,
  onSelectItem,
  onCreateAt,
  onOpenDay,
  onToggleStatus,
}: {
  days: Date[];
  items: CalendarItem[];
  timeZone: string;
  anchorMonth: string;
  onSelectItem: (id: string) => void;
  onCreateAt: (start: Date, allDay: boolean) => void;
  onOpenDay: (day: Date) => void;
  onToggleStatus: (item: CalendarItem) => void;
}) {
  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const anchor = item.startAt ?? item.dueAt;
      if (!anchor) continue;
      const key = dayKey(anchor, timeZone);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items, timeZone]);

  const weekdayLabels = days.slice(0, 7).map((day) => formatInTimeZone(day, timeZone, "EEE"));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="border-l fd-grid-line px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7 overflow-y-auto fd-scroll-thin"
        style={{ gridAutoRows: "minmax(6.5rem, 1fr)" }}
      >
        {days.map((day) => {
          const key = dayKey(day, timeZone);
          const dayItems = byDay.get(key) ?? [];
          const outside = formatInTimeZone(day, timeZone, "yyyy-MM") !== anchorMonth;
          const today = isToday(day, timeZone);
          const hidden = dayItems.length - MAX_VISIBLE;

          return (
            <div
              key={key}
              className={cn(
                "group flex min-w-0 flex-col gap-1 border-b border-l fd-grid-line p-1.5",
                outside && "bg-surface-sunken/60",
                today && "bg-accent/15",
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors hover:bg-muted",
                    today && "bg-primary text-primary-foreground hover:bg-primary",
                    outside && !today && "text-muted-foreground/60",
                  )}
                >
                  {formatInTimeZone(day, timeZone, "d")}
                </button>
                <button
                  type="button"
                  onClick={() => onCreateAt(new Date(day.getTime() + 9 * 3_600_000), false)}
                  aria-label={`Add a task on ${formatInTimeZone(day, timeZone, "d MMMM")}`}
                  className="rounded px-1 text-[13px] leading-none text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                >
                  +
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
                {dayItems.slice(0, MAX_VISIBLE).map((item) => (
                  <TaskBlock
                    key={item.id}
                    item={item}
                    variant="chip"
                    timeZone={timeZone}
                    onClick={() => onSelectItem(item.id)}
                    onToggleStatus={() => onToggleStatus(item)}
                  />
                ))}
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="w-full rounded px-1.5 text-left text-[10.5px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{hidden} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
