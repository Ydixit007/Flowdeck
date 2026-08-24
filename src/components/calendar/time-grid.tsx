"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/server/tasks";
import { dayKey, isToday } from "@/components/calendar/range";
import { TaskBlock } from "@/components/calendar/task-block";

const HOUR_HEIGHT = 52;
const SNAP_MINUTES = 15;
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;

export interface DragChange {
  item: CalendarItem;
  startAt: Date;
  dueAt: Date | null;
}

interface TimeGridProps {
  days: Date[];
  items: CalendarItem[];
  timeZone: string;
  onSelectItem: (id: string) => void;
  onCreateAt: (start: Date, allDay: boolean) => void;
  onCommit: (change: DragChange) => void;
  onToggleStatus: (item: CalendarItem) => void;
}

interface DragState {
  mode: "move" | "resize";
  item: CalendarItem;
  pointerId: number;
  originY: number;
  originX: number;
  originDayIndex: number;
  startMinutes: number;
  durationMinutes: number;
  previewStartMinutes: number;
  previewDurationMinutes: number;
  previewDayIndex: number;
}

/** Minutes from local midnight for an instant, in the user's timezone. */
function minutesOfDay(instant: Date, timeZone: string): number {
  const [hours, minutes] = formatInTimeZone(instant, timeZone, "HH:mm").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function snap(minutes: number): number {
  return Math.max(0, Math.min(24 * 60, Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES));
}

export function TimeGrid({
  days,
  items,
  timeZone,
  onSelectItem,
  onCreateAt,
  onCommit,
  onToggleStatus,
}: TimeGridProps) {
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = React.useState(() => minutesOfDay(new Date(), timeZone));

  React.useEffect(() => {
    const tick = (): void => setNowMinutes(minutesOfDay(new Date(), timeZone));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [timeZone]);

  // Scroll to a sensible hour on mount rather than midnight.
  React.useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    node.scrollTop = Math.max(0, ((nowMinutes - 90) / 60) * HOUR_HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayKeys = React.useMemo(() => days.map((day) => dayKey(day, timeZone)), [days, timeZone]);

  const { timed, allDay } = React.useMemo(() => {
    const timedByDay = new Map<string, CalendarItem[]>();
    const allDayByDay = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const anchor = item.startAt ?? item.dueAt;
      if (!anchor) continue;
      const key = dayKey(anchor, timeZone);
      const bucket = item.allDay ? allDayByDay : timedByDay;
      const list = bucket.get(key) ?? [];
      list.push(item);
      bucket.set(key, list);
    }
    return { timed: timedByDay, allDay: allDayByDay };
  }, [items, timeZone]);

  const finishDrag = React.useCallback(
    (state: DragState) => {
      const targetDay = days[state.previewDayIndex] ?? days[state.originDayIndex];
      if (!targetDay) return;
      const startAt = new Date(targetDay.getTime() + state.previewStartMinutes * 60_000);
      const dueAt =
        state.previewDurationMinutes > 0
          ? new Date(startAt.getTime() + state.previewDurationMinutes * 60_000)
          : null;
      if (
        state.previewStartMinutes !== state.startMinutes ||
        state.previewDurationMinutes !== state.durationMinutes ||
        state.previewDayIndex !== state.originDayIndex
      ) {
        onCommit({ item: state.item, startAt, dueAt });
      }
    },
    [days, onCommit],
  );

  React.useEffect(() => {
    if (!drag) return;

    const columnWidth = (): number => {
      const node = gridRef.current?.querySelector<HTMLElement>("[data-day-column]");
      return node?.getBoundingClientRect().width ?? 0;
    };

    const onMove = (event: PointerEvent): void => {
      if (event.pointerId !== drag.pointerId) return;
      const deltaMinutes = ((event.clientY - drag.originY) / HOUR_HEIGHT) * 60;

      setDrag((current) => {
        if (!current) return current;
        if (current.mode === "resize") {
          const duration = snap(Math.max(SNAP_MINUTES, current.durationMinutes + deltaMinutes));
          return { ...current, previewDurationMinutes: Math.min(duration, 24 * 60 - current.previewStartMinutes) };
        }
        const width = columnWidth();
        const dayShift = width > 0 && days.length > 1 ? Math.round((event.clientX - startX) / width) : 0;
        const nextIndex = Math.max(0, Math.min(days.length - 1, current.originDayIndex + dayShift));
        const start = snap(current.startMinutes + deltaMinutes);
        return {
          ...current,
          previewStartMinutes: Math.min(start, 24 * 60 - current.previewDurationMinutes),
          previewDayIndex: nextIndex,
        };
      });
    };

    const startX = drag.originX;

    const onUp = (event: PointerEvent): void => {
      if (event.pointerId !== drag.pointerId) return;
      setDrag((current) => {
        if (current) finishDrag(current);
        return null;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, days.length, finishDrag]);

  const beginDrag = (
    event: React.PointerEvent,
    item: CalendarItem,
    mode: "move" | "resize",
    dayIndex: number,
  ): void => {
    if (event.button !== 0 || !item.startAt) return;
    event.preventDefault();
    event.stopPropagation();
    const startMinutes = minutesOfDay(new Date(item.startAt), timeZone);
    const duration =
      item.dueAt && item.startAt
        ? Math.max(SNAP_MINUTES, (new Date(item.dueAt).getTime() - new Date(item.startAt).getTime()) / 60_000)
        : item.estimatedMinutes ?? 30;

    setDrag({
      mode,
      item,
      pointerId: event.pointerId,
      originY: event.clientY,
      originX: event.clientX,
      originDayIndex: dayIndex,
      startMinutes,
      durationMinutes: duration,
      previewStartMinutes: startMinutes,
      previewDurationMinutes: duration,
      previewDayIndex: dayIndex,
    });
  };

  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);
  const hasAllDay = dayKeys.some((key) => (allDay.get(key)?.length ?? 0) > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 border-b border-border pr-2.5">
        <div className="w-14 shrink-0" />
        {days.map((day, index) => {
          const today = isToday(day, timeZone);
          return (
            <div
              key={dayKeys[index]}
              className={cn(
                "min-w-0 flex-1 border-l fd-grid-line px-2 py-2 text-center",
                today && "bg-accent/25",
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {formatInTimeZone(day, timeZone, "EEE")}
              </p>
              <p
                className={cn(
                  "mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
                  today ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {formatInTimeZone(day, timeZone, "d")}
              </p>
            </div>
          );
        })}
      </div>

      {hasAllDay ? (
        <div className="flex shrink-0 border-b border-border pr-2.5">
          <div className="flex w-14 shrink-0 items-start justify-end pr-2 pt-1.5">
            <span className="text-[10px] uppercase text-muted-foreground">All day</span>
          </div>
          {dayKeys.map((key) => (
            <div key={`allday-${key}`} className="min-w-0 flex-1 space-y-1 border-l fd-grid-line p-1">
              {(allDay.get(key) ?? []).map((item) => (
                <TaskBlock
                  key={item.id}
                  item={item}
                  variant="chip"
                  onClick={() => onSelectItem(item.id)}
                  onToggleStatus={() => onToggleStatus(item)}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div ref={gridRef} className="fd-scroll-thin relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: hours.length * HOUR_HEIGHT }}>
          <div className="w-14 shrink-0">
            {hours.map((hour) => (
              <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute -top-1.5 right-2 text-[10px] tabular-nums text-muted-foreground">
                  {hour === 0 ? "" : `${String(hour).padStart(2, "0")}:00`}
                </span>
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => {
            const key = dayKeys[dayIndex] as string;
            const dayItems = timed.get(key) ?? [];
            const today = isToday(day, timeZone);
            return (
              <div
                key={key}
                data-day-column
                className={cn("relative min-w-0 flex-1 border-l fd-grid-line", today && "bg-accent/12")}
              >
                {hours.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    aria-label={`Create a task at ${String(hour).padStart(2, "0")}:00 on ${formatInTimeZone(day, timeZone, "d MMMM")}`}
                    onClick={() => onCreateAt(new Date(day.getTime() + hour * 3_600_000), false)}
                    className="block w-full border-t fd-grid-line transition-colors hover:bg-primary/[0.06]"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}

                {today && nowMinutes >= 0 ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  >
                    <span className="size-1.5 rounded-full bg-destructive" />
                    <span className="h-px flex-1 bg-destructive" />
                  </div>
                ) : null}

                {dayItems.map((item) => {
                  const dragging = drag?.item.id === item.id;
                  const startMinutes = dragging
                    ? drag.previewStartMinutes
                    : minutesOfDay(new Date(item.startAt as string), timeZone);
                  const duration = dragging
                    ? drag.previewDurationMinutes
                    : item.dueAt && item.startAt
                      ? Math.max(
                          SNAP_MINUTES,
                          (new Date(item.dueAt).getTime() - new Date(item.startAt).getTime()) / 60_000,
                        )
                      : (item.estimatedMinutes ?? 30);
                  const visible = !dragging || drag.previewDayIndex === dayIndex;
                  if (!visible) return null;

                  return (
                    <div
                      key={item.id}
                      className={cn("absolute inset-x-1 z-10", dragging && "z-30 opacity-90")}
                      style={{
                        top: (startMinutes / 60) * HOUR_HEIGHT,
                        height: Math.max(22, (duration / 60) * HOUR_HEIGHT - 2),
                      }}
                    >
                      <TaskBlock
                        item={item}
                        variant="block"
                        timeZone={timeZone}
                        onClick={() => onSelectItem(item.id)}
                        onToggleStatus={() => onToggleStatus(item)}
                        onPointerDownDrag={(event) => beginDrag(event, item, "move", dayIndex)}
                        onPointerDownResize={(event) => beginDrag(event, item, "resize", dayIndex)}
                      />
                    </div>
                  );
                })}

                {/* Ghost target while dragging across columns. */}
                {drag && drag.previewDayIndex === dayIndex && drag.originDayIndex !== dayIndex ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-dashed border-primary/60 bg-primary/10"
                    style={{
                      top: (drag.previewStartMinutes / 60) * HOUR_HEIGHT,
                      height: Math.max(22, (drag.previewDurationMinutes / 60) * HOUR_HEIGHT - 2),
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
