"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarDays, KanbanSquare, Megaphone, Plus } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp, useTasks, splitItemId, type TaskFilters } from "@/lib/client/store";
import { useShell } from "@/components/layout/app-shell";
import { dayStart } from "@/components/calendar/range";
import { CONTENT_STATUSES, type ContentStatus } from "@/lib/types";
import type { CalendarItem } from "@/server/tasks";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { FilterBar } from "@/components/tasks/filter-bar";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { CalendarView } from "@/components/calendar/calendar-view";
import { CONTENT_STATUS_META, PLATFORM_META } from "@/components/tasks/task-meta";

type Mode = "board" | "calendar";

export function ContentScreen() {
  const { user } = useApp();
  const { openQuickAdd } = useShell();
  const [mode, setMode] = React.useState<Mode>("board");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Megaphone className="size-4 text-primary" /> Content pipeline
        </h2>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => openQuickAdd({ isContent: true })}>
          <Plus /> New content
        </Button>
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList>
            <TabsTrigger value="board">
              <KanbanSquare className="size-3.5" /> Board
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="size-3.5" /> Calendar
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === "calendar" ? (
        <div className="min-h-0 flex-1">
          <CalendarView initialView="month" contentOnly />
        </div>
      ) : (
        <ContentBoard timeZone={user.timezone} />
      )}
    </div>
  );
}

function ContentBoard({ timeZone }: { timeZone: string }) {
  const { openQuickAdd } = useShell();
  const [filters, setFilters] = React.useState<TaskFilters>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const from = React.useMemo(() => new Date(dayStart(new Date(), timeZone).getTime() - 60 * 86_400_000), [timeZone]);
  const to = React.useMemo(() => new Date(dayStart(new Date(), timeZone).getTime() + 120 * 86_400_000), [timeZone]);

  const { items, loading, reload, mutateItem } = useTasks({ from, to, isContent: true, ...filters }, [
    from.toISOString(),
    to.toISOString(),
    JSON.stringify(filters),
    "content-board",
  ]);

  const byStatus = React.useMemo(() => {
    const map = new Map<ContentStatus, CalendarItem[]>(CONTENT_STATUSES.map((status) => [status, []]));
    for (const item of items) {
      const status = item.content?.contentStatus ?? "IDEA";
      map.get(status)?.push(item);
    }
    return map;
  }, [items]);

  /** Moves a card to another column, keeping every other content field. */
  const moveTo = (item: CalendarItem, status: ContentStatus): void => {
    const { taskId } = splitItemId(item.id);
    void mutateItem(
      item.id,
      { content: item.content ? { ...item.content, contentStatus: status } : null },
      () =>
        api.patch(`/api/tasks/${taskId}`, {
          scope: "SERIES",
          isContent: true,
          content: { ...item.content, contentStatus: status },
        }),
    );
  };

  if (loading && items.length === 0) {
    return (
      <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-6">
        {CONTENT_STATUSES.map((status) => (
          <Skeleton key={status} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2.5 sm:px-4">
        <FilterBar filters={filters} onChange={setFilters} showContentFilters />
      </div>

      {items.length === 0 ? (
        <div className="fd-panel mx-3 mb-3 sm:mx-4">
          <EmptyState
            icon={<Megaphone />}
            title="No content planned yet"
            description="Capture ideas, move them through review, and see the whole pipeline at a glance."
            action={
              <Button size="sm" onClick={() => openQuickAdd({ isContent: true })}>
                <Plus /> Add the first idea
              </Button>
            }
          />
        </div>
      ) : (
        <div className="fd-scroll-thin min-h-0 flex-1 overflow-x-auto px-3 pb-4 sm:px-4">
          <div className="flex min-h-full gap-3" style={{ minWidth: `${CONTENT_STATUSES.length * 14}rem` }}>
            {CONTENT_STATUSES.map((status) => {
              const column = byStatus.get(status) ?? [];
              const meta = CONTENT_STATUS_META[status];
              return (
                <section key={status} className="flex w-56 shrink-0 flex-col rounded-lg bg-surface-sunken">
                  <header className="flex items-center justify-between px-2.5 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${meta.className}`}>
                      {meta.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{column.length}</span>
                  </header>
                  <ul className="fd-scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5">
                    {column.map((item) => (
                      <li key={item.id}>
                        <ContentCard
                          item={item}
                          timeZone={timeZone}
                          onOpen={() => setSelectedId(item.id)}
                          onMove={(next) => moveTo(item, next)}
                        />
                      </li>
                    ))}
                    {column.length === 0 ? (
                      <li className="px-1.5 py-3 text-center text-[11px] text-muted-foreground">Nothing here</li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <TaskDetailPanel itemId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void reload()} />
    </div>
  );
}

function ContentCard({
  item,
  timeZone,
  onOpen,
  onMove,
}: {
  item: CalendarItem;
  timeZone: string;
  onOpen: () => void;
  onMove: (status: ContentStatus) => void;
}) {
  const { members, user } = useApp();
  const platform = item.content?.platform ?? "OTHER";
  const publishAt = item.content?.publishAt ?? item.startAt;
  const assignee = React.useMemo(() => {
    if (!item.assigneeId) return null;
    if (user && item.assigneeId === user.id) return user;
    return members.find((m) => m.id === item.assigneeId) ?? { name: "Assigned", avatar: null };
  }, [item.assigneeId, members, user]);

  return (
    <div className="rounded-md border border-border bg-surface p-2 transition-colors hover:border-border-strong">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: PLATFORM_META[platform].color }} />
          <span className="truncate text-[11px] font-medium text-muted-foreground">
            {PLATFORM_META[platform].label}
            {item.content?.contentType ? ` · ${item.content.contentType.toLowerCase()}` : ""}
          </span>
        </span>
        <span className="mt-1 block text-[12.5px] font-semibold leading-snug">{item.title}</span>
        {publishAt ? (
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {formatInTimeZone(new Date(publishAt), timeZone, "EEE d MMM · HH:mm")}
          </span>
        ) : null}
        {assignee ? (
          <span className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Avatar name={assignee.name} src={assignee.avatar} size="xs" />
            <span className="truncate font-medium">{assignee.name}</span>
          </span>
        ) : null}
      </button>
      <select
        aria-label={`Move ${item.title} to another stage`}
        value={item.content?.contentStatus ?? "IDEA"}
        onChange={(event) => onMove(event.target.value as ContentStatus)}
        className="mt-2 w-full rounded border border-input bg-surface-sunken px-1.5 py-1 text-[11px] outline-none focus-visible:border-ring"
      >
        {CONTENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {CONTENT_STATUS_META[status].label}
          </option>
        ))}
      </select>
    </div>
  );
}
