"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Flag } from "lucide-react";
import type { CalendarItem } from "@/server/tasks";
import { EmptyState } from "@/components/ui/misc";

interface Milestone {
  _id: string;
  title: string;
  targetDate: string | null;
  completedAt: string | null;
}

const MIN_SPAN_MS = 14 * 86_400_000;
/** Width of the left gutter holding task names, so bars start after it. */
const LABEL_COL = "11rem";

/**
 * Deliberately simple roadmap: one row per scheduled task, positioned on a
 * shared time axis with milestone markers. Not a Gantt engine — no dependency
 * arrows, no drag rescheduling (do that on the calendar).
 */
export function RoadmapTimeline({
  items,
  milestones,
  timeZone,
  color,
  onSelect,
}: {
  items: CalendarItem[];
  milestones: Milestone[];
  timeZone: string;
  color: string;
  onSelect: (id: string) => void;
}) {
  // Read the clock once on mount; the roadmap does not need a live marker.
  const [now] = React.useState(() => Date.now());

  const rows = items
    .filter((item) => item.startAt || item.dueAt)
    .sort((a, b) => (a.startAt ?? a.dueAt ?? "").localeCompare(b.startAt ?? b.dueAt ?? ""));

  const bounds = React.useMemo(() => {
    const stamps: number[] = [];
    for (const item of rows) {
      if (item.startAt) stamps.push(new Date(item.startAt).getTime());
      if (item.dueAt) stamps.push(new Date(item.dueAt).getTime());
    }
    for (const milestone of milestones) {
      if (milestone.targetDate) stamps.push(new Date(milestone.targetDate).getTime());
    }
    if (stamps.length === 0) return null;
    let min = Math.min(...stamps);
    let max = Math.max(...stamps);
    if (max - min < MIN_SPAN_MS) max = min + MIN_SPAN_MS;
    // Breathing room at both ends so bars never touch the edges.
    const pad = (max - min) * 0.04;
    min -= pad;
    max += pad;
    return { min, max, span: max - min };
  }, [rows, milestones]);

  if (!bounds || rows.length === 0) {
    return (
      <div className="fd-panel">
        <EmptyState
          icon={<Flag />}
          title="Nothing to plot yet"
          description="Schedule tasks or add milestone dates and the roadmap fills in."
        />
      </div>
    );
  }

  const percentFor = (stamp: number): number => ((stamp - bounds.min) / bounds.span) * 100;

  // A roadmap spanning days needs day ticks; one spanning months needs months.
  // Month labels alone leave a short range with a single tick and no scale.
  const stepDays = bounds.span <= 21 * 86_400_000 ? 1 : bounds.span <= 120 * 86_400_000 ? 7 : 0;
  const ticks: Array<{ label: string; left: number }> = [];
  {
    const cursor = new Date(bounds.min);
    cursor.setUTCHours(12, 0, 0, 0);
    if (stepDays === 0) cursor.setUTCDate(1);
    while (cursor.getTime() <= bounds.max) {
      if (cursor.getTime() >= bounds.min) {
        ticks.push({
          label: formatInTimeZone(cursor, timeZone, stepDays === 0 ? "MMM" : "d MMM"),
          left: percentFor(cursor.getTime()),
        });
      }
      if (stepDays === 0) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + stepDays);
    }
  }

  const nowLeft = percentFor(now);

  return (
    <div className="fd-panel overflow-hidden">
      {/* Header: label gutter, then the shared time axis. */}
      <div className="flex border-b border-border">
        <div className="shrink-0" style={{ width: LABEL_COL }} />
        <div className="relative h-6 min-w-0 flex-1">
          {ticks.map((tick) => (
            <span
              key={`${tick.label}-${tick.left}`}
              className="absolute top-1 -translate-x-1/2 whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground"
              style={{ left: `${tick.left}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex py-2">
        <div className="shrink-0" style={{ width: LABEL_COL }}>
          {rows.map((item) => (
            <div key={`label-${item.id}`} className="flex h-7 items-center px-3">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                title={item.title}
                className="truncate text-left text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                {item.title}
              </button>
            </div>
          ))}
        </div>

        {/* Plot area: every % below is relative to this box, not the panel. */}
        <div className="relative min-w-0 flex-1 border-l border-border">
          {milestones
            .filter((milestone) => milestone.targetDate)
            .map((milestone) => (
              <div
                key={milestone._id}
                className="pointer-events-none absolute inset-y-0 z-10 border-l border-dashed border-warning/70"
                style={{ left: `${percentFor(new Date(milestone.targetDate as string).getTime())}%` }}
              >
                <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-medium text-warning">
                  {milestone.title}
                </span>
              </div>
            ))}

          {nowLeft >= 0 && nowLeft <= 100 ? (
            <div
              aria-hidden
              title="Today"
              className="pointer-events-none absolute inset-y-0 z-10 border-l border-destructive"
              style={{ left: `${nowLeft}%` }}
            />
          ) : null}

          {rows.map((item) => {
            const start = new Date(item.startAt ?? (item.dueAt as string)).getTime();
            const end = new Date(item.dueAt ?? item.startAt ?? "").getTime();
            const left = percentFor(start);
            // Clamped so a bar never runs past the right edge of the plot.
            const width = Math.min(Math.max(1, percentFor(end) - left), 100 - left);
            const done = item.status === "DONE";
            return (
              <div key={item.id} className="relative h-7">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  title={`${item.title} · ${formatInTimeZone(start, timeZone, "d MMM")}${
                    item.dueAt ? ` – ${formatInTimeZone(end, timeZone, "d MMM")}` : ""
                  }`}
                  className="absolute top-1.5 h-4 rounded-sm transition-opacity hover:opacity-80"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: done ? "var(--muted-foreground)" : color,
                    opacity: done ? 0.5 : 1,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
