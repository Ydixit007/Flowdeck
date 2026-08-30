"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutList } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp, useTasks, splitItemId, type TaskFilters } from "@/lib/client/store";
import { useShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, Skeleton } from "@/components/ui/misc";
import { FilterBar } from "@/components/tasks/filter-bar";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { TimeGrid, type DragChange } from "@/components/calendar/time-grid";
import { MonthGrid } from "@/components/calendar/month-grid";
import { AgendaList } from "@/components/calendar/agenda-list";
import { buildRange, shiftAnchor, VIEW_LABELS, type CalendarView } from "@/components/calendar/range";
import type { CalendarItem } from "@/server/tasks";

const VIEWS: CalendarView[] = ["day", "week", "fifteen", "month"];

export function CalendarView({
  initialView = "week",
  contentOnly = false,
}: {
  initialView?: CalendarView;
  contentOnly?: boolean;
}) {
  const { user } = useApp();
  const { openQuickAdd } = useShell();
  const timeZone = user.timezone;

  const [view, setView] = React.useState<CalendarView>(initialView);
  const [anchor, setAnchor] = React.useState<Date>(() => new Date());
  const [filters, setFilters] = React.useState<TaskFilters>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [mobileAgenda, setMobileAgenda] = React.useState(true);

  const range = React.useMemo(() => buildRange(view, anchor, timeZone), [view, anchor, timeZone]);

  const { items, loading, reload, mutateItem } = useTasks(
    { from: range.from, to: range.to, ...filters, isContent: contentOnly ? true : undefined },
    [range.from.toISOString(), range.to.toISOString(), JSON.stringify(filters), contentOnly],
  );

  /** Optimistic drag/resize: the block moves immediately, the server follows. */
  const commitDrag = ({ item, startAt, dueAt }: DragChange): void => {
    const { taskId, occurrenceStart } = splitItemId(item.id);
    void mutateItem(
      item.id,
      // Dropping onto the time grid gives the task a clock time, so it stops
      // being all-day; without this it renders in both rows at once.
      { startAt: startAt.toISOString(), dueAt: dueAt?.toISOString() ?? null, allDay: false },
      () =>
        api.patch(`/api/tasks/${taskId}`, {
          startAt: startAt.toISOString(),
          dueAt: dueAt?.toISOString() ?? null,
          allDay: false,
          // Dragging one date of a series edits just that occurrence.
          scope: occurrenceStart ? "OCCURRENCE" : "SERIES",
          occurrenceStart,
        }),
    );
  };

  const toggleStatus = (item: CalendarItem): void => {
    const { taskId, occurrenceStart } = splitItemId(item.id);
    const nextStatus = item.status === "DONE" ? "TODO" : "DONE";
    void mutateItem(
      item.id,
      { status: nextStatus, completedAt: nextStatus === "DONE" ? new Date().toISOString() : null },
      () =>
        api.patch(`/api/tasks/${taskId}`, {
          status: nextStatus,
          scope: occurrenceStart ? "OCCURRENCE" : "SERIES",
          occurrenceStart,
        }),
    );
  };

  const jumpToday = (): void => setAnchor(new Date());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous period"
            onClick={() => setAnchor((current) => shiftAnchor(view, current, -1, timeZone))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next period"
            onClick={() => setAnchor((current) => shiftAnchor(view, current, 1, timeZone))}
          >
            <ChevronRight />
          </Button>
        </div>

        <p className="min-w-0 text-[13px] font-semibold tracking-tight">{range.title}</p>

        <Button variant="secondary" size="sm" onClick={jumpToday}>
          Today
        </Button>

        <Input
          type="date"
          aria-label="Jump to date"
          value={formatInTimeZone(anchor, timeZone, "yyyy-MM-dd")}
          onChange={(event) => {
            if (!event.target.value) return;
            setAnchor(new Date(`${event.target.value}T12:00:00Z`));
          }}
          className="h-8 w-36 text-[12px]"
        />

        <div className="flex-1" />

        <FilterBar filters={filters} onChange={setFilters} showContentFilters={contentOnly} />

        <Tabs value={view} onValueChange={(value) => setView(value as CalendarView)} className="hidden sm:block">
          <TabsList>
            {VIEWS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {VIEW_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Button
          variant="ghost"
          size="icon-sm"
          className="sm:hidden"
          aria-label={mobileAgenda ? "Show grid" : "Show agenda"}
          onClick={() => setMobileAgenda((current) => !current)}
        >
          {mobileAgenda ? <CalendarDays /> : <LayoutList />}
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Mobile: agenda by default; the grids stay available on demand. */}
          <div className={mobileAgenda ? "min-h-0 flex-1 overflow-y-auto sm:hidden" : "hidden"}>
            <AgendaList
              days={range.days}
              items={items}
              timeZone={timeZone}
              onSelectItem={setSelectedId}
              onCreateAt={(start, allDay) => openQuickAdd({ startAt: start, allDay })}
              onToggleStatus={toggleStatus}
              hideEmptyDays={view !== "day"}
            />
          </div>

          <div className={mobileAgenda ? "hidden min-h-0 flex-1 sm:flex sm:flex-col" : "flex min-h-0 flex-1 flex-col"}>
            {view === "month" ? (
              <MonthGrid
                days={range.days}
                items={items}
                timeZone={timeZone}
                anchorMonth={formatInTimeZone(anchor, timeZone, "yyyy-MM")}
                onSelectItem={setSelectedId}
                onCreateAt={(start, allDay) => openQuickAdd({ startAt: start, allDay })}
                onOpenDay={(day) => {
                  setAnchor(day);
                  setView("day");
                }}
                onToggleStatus={toggleStatus}
              />
            ) : view === "fifteen" ? (
              // 15 columns of hour grid is unreadable, so this range uses the agenda.
              <div className="min-h-0 flex-1 overflow-y-auto fd-scroll-thin">
                <AgendaList
                  days={range.days}
                  items={items}
                  timeZone={timeZone}
                  onSelectItem={setSelectedId}
                  onCreateAt={(start, allDay) => openQuickAdd({ startAt: start, allDay })}
                  onToggleStatus={toggleStatus}
                  hideEmptyDays={false}
                />
              </div>
            ) : (
              <TimeGrid
                days={range.days}
                items={items}
                timeZone={timeZone}
                onSelectItem={setSelectedId}
                onCreateAt={(start, allDay) => openQuickAdd({ startAt: start, allDay })}
                onCommit={commitDrag}
                onToggleStatus={toggleStatus}
              />
            )}
          </div>
        </>
      )}

      <TaskDetailPanel itemId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void reload()} />
    </div>
  );
}
