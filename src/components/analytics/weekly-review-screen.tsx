"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { useApp, useTasks } from "@/lib/client/store";
import { formatMinutes } from "@/lib/utils";
import { buildRange, shiftAnchor } from "@/components/calendar/range";
import type { CalendarItem } from "@/server/tasks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Progress, Skeleton, EmptyState } from "@/components/ui/misc";
import { TaskBlock } from "@/components/calendar/task-block";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";

const NOTES_KEY = "flowdeck.reviewNotes";

/** Look back over a week: what shipped, what slipped, what is next. */
export function WeeklyReviewScreen() {
  const { user, projects } = useApp();
  const timeZone = user.timezone;

  // Default to the week just gone, since a review is retrospective.
  const [anchor, setAnchor] = React.useState(() => new Date(Date.now() - 7 * 86_400_000));
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");

  const range = React.useMemo(() => buildRange("week", anchor, timeZone), [anchor, timeZone]);
  const notesKey = `${NOTES_KEY}.${formatInTimeZone(range.from, timeZone, "yyyy-'W'II")}`;

  React.useEffect(() => {
    setNotes(window.localStorage.getItem(notesKey) ?? "");
  }, [notesKey]);

  const { items, loading, reload } = useTasks({ from: range.from, to: range.to }, [
    range.from.toISOString(),
    range.to.toISOString(),
    "review",
  ]);

  // The next week, so the review ends on what is coming rather than what is gone.
  const nextRange = React.useMemo(
    () => buildRange("week", shiftAnchor("week", anchor, 1, timeZone), timeZone),
    [anchor, timeZone],
  );
  const next = useTasks({ from: nextRange.from, to: nextRange.to }, [
    nextRange.from.toISOString(),
    nextRange.to.toISOString(),
    "review-next",
  ]);

  const completed = items.filter((item) => item.status === "DONE");
  const cancelled = items.filter((item) => item.status === "CANCELLED");
  const carried = items.filter((item) => item.status === "TODO" || item.status === "IN_PROGRESS");
  const overdue = carried.filter((item) => {
    const due = item.dueAt ?? item.startAt;
    return Boolean(due && new Date(due) < new Date());
  });

  const actualMinutes = completed.reduce((sum, item) => sum + (item.actualMinutes ?? 0), 0);
  const estimatedMinutes = items.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0);
  const rate = items.length > 0 ? Math.round((completed.length / items.length) * 100) : 0;

  const byProject = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of completed) {
      const key = item.projectId ?? "none";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([id, count]) => ({
        id,
        count,
        name: id === "none" ? "No project" : (projects.find((p) => p.id === id)?.name ?? "Unknown"),
        color: id === "none" ? "#94a3b8" : (projects.find((p) => p.id === id)?.color ?? "#6366f1"),
      }))
      .sort((a, b) => b.count - a.count);
  }, [completed, projects]);

  const deadlines = next.items
    .filter((item) => item.dueAt && item.status !== "DONE")
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
    .slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous week"
          onClick={() => setAnchor((current) => shiftAnchor("week", current, -1, timeZone))}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next week"
          onClick={() => setAnchor((current) => shiftAnchor("week", current, 1, timeZone))}
        >
          <ChevronRight />
        </Button>
        <p className="text-[13px] font-semibold">{range.title}</p>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date(Date.now() - 7 * 86_400_000))}>
          Last week
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <section className="fd-panel p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  {completed.length === 0
                    ? "A quiet week"
                    : `${completed.length} task${completed.length === 1 ? "" : "s"} finished`}
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {carried.length} carried over · {overdue.length} overdue · {cancelled.length} cancelled ·{" "}
                  {formatMinutes(actualMinutes)} logged against {formatMinutes(estimatedMinutes)} estimated
                </p>
              </div>
              <div className="w-full space-y-1.5 sm:w-48">
                <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                  <span>Completion rate</span>
                  <span className="text-[13px] font-semibold tabular-nums text-foreground">{rate}%</span>
                </div>
                <Progress value={rate} />
              </div>
            </div>

            {byProject.length > 0 ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Most productive projects
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {byProject.slice(0, 5).map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px]"
                    >
                      <span className="size-2 rounded-full" style={{ background: row.color }} />
                      {row.name}
                      <span className="font-semibold tabular-nums">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <ReviewList
              title="Completed"
              items={completed}
              timeZone={timeZone}
              emptyText="Nothing was marked done this week."
              onSelect={setSelectedId}
            />
            <ReviewList
              title="Carried over"
              items={carried}
              timeZone={timeZone}
              emptyText="Nothing left hanging. Rare and good."
              onSelect={setSelectedId}
            />
          </div>

          <section className="fd-panel p-4">
            <h2 className="text-[13px] font-semibold">Upcoming deadlines</h2>
            {deadlines.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">No hard deadlines next week.</p>
            ) : (
              <ul className="mt-2.5 space-y-1.5">
                {deadlines.map((item) => (
                  <li key={item.id} className="flex items-center gap-2.5">
                    <span className="w-16 shrink-0 text-[11px] font-medium uppercase text-muted-foreground">
                      {formatInTimeZone(new Date(item.dueAt as string), timeZone, "EEE d MMM")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="min-w-0 flex-1 truncate text-left text-[13px] hover:text-primary"
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="fd-panel p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              <ClipboardList className="size-4" /> Reflection
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              What worked, what didn&apos;t, what changes next week. Saved on this device.
            </p>
            <Textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                window.localStorage.setItem(notesKey, event.target.value);
              }}
              placeholder="Went well… / Got in the way… / Next week I will…"
              className="mt-2.5 min-h-28 text-[13px]"
            />
          </section>
        </>
      )}

      <TaskDetailPanel itemId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void reload()} />
    </div>
  );
}

function ReviewList({
  title,
  items,
  timeZone,
  emptyText,
  onSelect,
}: {
  title: string;
  items: CalendarItem[];
  timeZone: string;
  emptyText: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="fd-panel flex flex-col">
      <header className="flex items-baseline gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <span className="text-[12px] tabular-nums text-muted-foreground">{items.length}</span>
      </header>
      <div className="flex-1 p-3">
        {items.length === 0 ? (
          <EmptyState title="Nothing here" description={emptyText} className="py-8" />
        ) : (
          <ul className="space-y-1.5">
            {items.slice(0, 12).map((item) => (
              <li key={item.id}>
                <TaskBlock
                  item={item}
                  variant="row"
                  timeZone={timeZone}
                  onClick={() => onSelect(item.id)}
                  onToggleStatus={() => undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
