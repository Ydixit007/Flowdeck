"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { CheckSquare, Plus } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp, useTasks, splitItemId, type TaskFilters } from "@/lib/client/store";
import { useShell } from "@/components/layout/app-shell";
import { dayStart } from "@/components/calendar/range";
import type { CalendarItem } from "@/server/tasks";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { FilterBar } from "@/components/tasks/filter-bar";
import { TaskBlock } from "@/components/calendar/task-block";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";

type Grouping = "date" | "project" | "priority";

const PRIORITY_ORDER = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"];

export function TaskListScreen() {
  const { user, projects } = useApp();
  const { openQuickAdd } = useShell();
  const timeZone = user.timezone;

  const [filters, setFilters] = React.useState<TaskFilters>({ assigneeId: "me" });
  const [grouping, setGrouping] = React.useState<Grouping>("date");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const from = React.useMemo(() => new Date(dayStart(new Date(), timeZone).getTime() - 30 * 86_400_000), [timeZone]);
  const to = React.useMemo(() => new Date(dayStart(new Date(), timeZone).getTime() + 90 * 86_400_000), [timeZone]);

  const { items, loading, reload, mutateItem } = useTasks({ from, to, ...filters }, [
    from.toISOString(),
    to.toISOString(),
    JSON.stringify(filters),
  ]);

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

  const groups = React.useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    const push = (key: string, item: CalendarItem): void => {
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    };

    for (const item of items) {
      if (grouping === "project") {
        push(item.projectId ? (projects.find((p) => p.id === item.projectId)?.name ?? "Unknown") : "No project", item);
      } else if (grouping === "priority") {
        push(item.priority, item);
      } else {
        const anchor = item.startAt ?? item.dueAt;
        push(anchor ? formatInTimeZone(new Date(anchor), timeZone, "EEEE d MMMM") : "Unscheduled", item);
      }
    }

    const entries = [...map.entries()];
    if (grouping === "priority") {
      entries.sort((a, b) => PRIORITY_ORDER.indexOf(a[0]) - PRIORITY_ORDER.indexOf(b[0]));
    } else if (grouping === "date") {
      // Keep chronological order; the API already sorts by start instant.
      entries.sort((a, b) => {
        const aTime = a[1][0]?.startAt ?? a[1][0]?.dueAt ?? "";
        const bTime = b[1][0]?.startAt ?? b[1][0]?.dueAt ?? "";
        if (!aTime) return 1;
        if (!bTime) return -1;
        return aTime < bTime ? -1 : 1;
      });
    } else {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
    }
    return entries;
  }, [items, grouping, projects, timeZone]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar filters={filters} onChange={setFilters} />
        <div className="flex-1" />
        <Tabs value={grouping} onValueChange={(value) => setGrouping(value as Grouping)}>
          <TabsList>
            <TabsTrigger value="date">By date</TabsTrigger>
            <TabsTrigger value="project">By project</TabsTrigger>
            <TabsTrigger value="priority">By priority</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="fd-panel">
          <EmptyState
            icon={<CheckSquare />}
            title="No tasks match this view"
            description="Adjust the filters, or add the first task."
            action={
              <Button size="sm" onClick={() => openQuickAdd()}>
                <Plus /> New task
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([label, groupItems]) => (
            <section key={label} className="space-y-1.5">
              <h2 className="flex items-baseline gap-2 px-1">
                <span className="text-[13px] font-semibold">{label}</span>
                <span className="text-[12px] tabular-nums text-muted-foreground">{groupItems.length}</span>
              </h2>
              <ul className="space-y-1.5">
                {groupItems.map((item) => (
                  <li key={item.id}>
                    <TaskBlock
                      item={item}
                      variant="row"
                      timeZone={timeZone}
                      onClick={() => setSelectedId(item.id)}
                      onToggleStatus={() => toggleStatus(item)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TaskDetailPanel itemId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void reload()} />
    </div>
  );
}
