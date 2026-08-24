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

  const monthTicks: Array<{ label: string; left: number }> = [];
  {
    const cursor = new Date(bounds.min);
    cursor.setUTCDate(1);
    cursor.setUTCHours(12, 0, 0, 0);
    while (cursor.getTime() <= bounds.max) {
      if (cursor.getTime() >= bounds.min) {
        monthTicks.push({
          label: formatInTimeZone(cursor, timeZone, "MMM"),
          left: percentFor(cursor.getTime()),
        });
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  const nowLeft = percentFor(now);

  return (
    <div className="fd-panel overflow-hidden">
      <div className="relative border-b border-border px-4 py-1.5">
        {monthTicks.map((tick) => (
          <span
            key={`${tick.label}-${tick.left}`}
            className="absolute top-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            style={{ left: `calc(${tick.left}% + 1rem)` }}
          >
            {tick.label}
          </span>
        ))}
        <div className="h-4" />
      </div>

      <div className="relative px-4 py-3">
        {/* Milestone markers span the full height of the plot. */}
        {milestones
          .filter((milestone) => milestone.targetDate)
          .map((milestone) => (
            <div
              key={milestone._id}
              className="pointer-events-none absolute inset-y-0 z-10 border-l border-dashed border-warning/70"
              style={{ left: `calc(${percentFor(new Date(milestone.targetDate as string).getTime())}% + 1rem)` }}
            >
              <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-medium text-warning">
                {milestone.title}
              </span>
            </div>
          ))}

        {nowLeft >= 0 && nowLeft <= 100 ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 border-l border-destructive"
            style={{ left: `calc(${nowLeft}% + 1rem)` }}
          />
        ) : null}

        <ul className="space-y-1">
          {rows.map((item) => {
            const start = new Date(item.startAt ?? (item.dueAt as string)).getTime();
            const end = new Date(item.dueAt ?? item.startAt ?? "").getTime();
            const left = percentFor(start);
            const width = Math.max(1.5, percentFor(Math.max(end, start + 3_600_000)) - left);
            return (
              <li key={item.id} className="relative h-7">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  title={item.title}
                  className="absolute top-1 flex h-5 items-center overflow-hidden rounded px-1.5 text-left text-[10.5px] font-medium text-white transition-opacity hover:opacity-90"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    minWidth: "4rem",
                    background: item.status === "DONE" ? "var(--muted-foreground)" : color,
                  }}
                >
                  <span className="truncate">{item.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
