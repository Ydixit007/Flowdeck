"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/server/tasks";
import { dayKey, isToday } from "@/components/calendar/range";
import { TaskBlock } from "@/components/calendar/task-block";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

/** Mobile-first representation of the same range the grids show. */
export function AgendaList({
  days,
  items,
  timeZone,
  onSelectItem,
  onCreateAt,
  onToggleStatus,
  hideEmptyDays = true,
}: {
  days: Date[];
  items: CalendarItem[];
  timeZone: string;
  onSelectItem: (id: string) => void;
  onCreateAt: (start: Date, allDay: boolean) => void;
  onToggleStatus: (item: CalendarItem) => void;
  hideEmptyDays?: boolean;
}) {
  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      if (item.allDay) {
        const startAnchor = item.startAt ?? item.dueAt;
        if (!startAnchor) continue;
        const startK = dayKey(startAnchor, timeZone);
        const endK = item.dueAt ? dayKey(item.dueAt, timeZone) : startK;
        const maxK = endK >= startK ? endK : startK;
        for (const day of days) {
          const k = dayKey(day, timeZone);
          if (k >= startK && k <= maxK) {
            const list = map.get(k) ?? [];
            list.push(item);
            map.set(k, list);
          }
        }
      } else {
        const anchor = item.startAt ?? item.dueAt;
        if (!anchor) continue;
        const key = dayKey(anchor, timeZone);
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      }
    }
    return map;
  }, [days, items, timeZone]);

  const visibleDays = hideEmptyDays
    ? days.filter((day) => (byDay.get(dayKey(day, timeZone))?.length ?? 0) > 0 || isToday(day, timeZone))
    : days;

  if (visibleDays.length === 0) {
    return (
      <EmptyState
        icon={<CalendarPlus />}
        title="Nothing scheduled here"
        description="Pick a slot to plan something, or use the quick-add box."
      />
    );
  }

  return (
    <ol className="divide-y divide-border">
      {visibleDays.map((day) => {
        const key = dayKey(day, timeZone);
        const dayItems = byDay.get(key) ?? [];
        const today = isToday(day, timeZone);
        return (
          <li key={key} className={cn("px-3 py-3 sm:px-4", today && "bg-accent/10")}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold">{formatInTimeZone(day, timeZone, "EEEE")}</span>
                <span className="text-[12px] text-muted-foreground">
                  {formatInTimeZone(day, timeZone, "d MMMM")}
                </span>
                {today ? (
                  <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                    Today
                  </span>
                ) : null}
              </h3>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Add a task on ${formatInTimeZone(day, timeZone, "d MMMM")}`}
                onClick={() => onCreateAt(new Date(day.getTime() + 9 * 3_600_000), false)}
              >
                <CalendarPlus />
              </Button>
            </div>
            {dayItems.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Nothing planned.</p>
            ) : (
              <ul className="space-y-1.5">
                {dayItems.map((item) => (
                  <li key={item.id}>
                    <TaskBlock
                      item={item}
                      variant="row"
                      timeZone={timeZone}
                      onClick={() => onSelectItem(item.id)}
                      onToggleStatus={() => onToggleStatus(item)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
