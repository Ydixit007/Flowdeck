"use client";

import * as React from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Inbox as InboxIcon,
  Plus,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp, useTasks, splitItemId } from "@/lib/client/store";
import { useShell } from "@/components/layout/app-shell";
import { dayStart } from "@/components/calendar/range";
import type { CalendarItem } from "@/server/tasks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Progress, Skeleton } from "@/components/ui/misc";
import { TaskBlock } from "@/components/calendar/task-block";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { PRIORITY_META } from "@/components/tasks/task-meta";
import { PresenceList } from "@/components/team/presence-list";

export function DashboardScreen() {
  const { user } = useApp();
  const { openQuickAdd } = useShell();
  const timeZone = user.timezone;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const now = React.useMemo(() => new Date(), []);
  const todayStart = React.useMemo(() => dayStart(now, timeZone), [now, timeZone]);
  const horizonEnd = React.useMemo(() => new Date(todayStart.getTime() + 8 * 86_400_000), [todayStart]);
  const overdueFrom = React.useMemo(() => new Date(todayStart.getTime() - 60 * 86_400_000), [todayStart]);

  const scheduled = useTasks({ from: overdueFrom, to: horizonEnd }, [
    overdueFrom.toISOString(),
    horizonEnd.toISOString(),
  ]);
  const inbox = useTasks({ unscheduled: true }, ["inbox"]);

  const todayKey = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const inDay = (item: CalendarItem, key: string): boolean => {
    const anchor = item.startAt ?? item.dueAt;
    return Boolean(anchor && formatInTimeZone(new Date(anchor), timeZone, "yyyy-MM-dd") === key);
  };

  const todays = scheduled.items.filter((item) => inDay(item, todayKey));
  const completedToday = todays.filter((item) => item.status === "DONE").length;
  const progress = todays.length > 0 ? Math.round((completedToday / todays.length) * 100) : 0;
  const highPriority = todays.filter(
    (item) => (item.priority === "HIGH" || item.priority === "URGENT") && item.status !== "DONE",
  );

  const overdue = scheduled.items.filter((item) => {
    if (item.status === "DONE" || item.status === "CANCELLED") return false;
    const due = item.dueAt ?? item.startAt;
    return Boolean(due && new Date(due) < now && !inDay(item, todayKey));
  });

  const upcoming = scheduled.items
    .filter((item) => {
      const anchor = item.startAt ?? item.dueAt;
      if (!anchor || item.status === "DONE") return false;
      const key = formatInTimeZone(new Date(anchor), timeZone, "yyyy-MM-dd");
      return key > todayKey;
    })
    .slice(0, 8);

  const greeting = (() => {
    const hour = Number(formatInTimeZone(now, timeZone, "H"));
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  const toggleStatus = (item: CalendarItem): void => {
    const { taskId, occurrenceStart } = splitItemId(item.id);
    const nextStatus = item.status === "DONE" ? "TODO" : "DONE";
    void scheduled.mutateItem(
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

  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-3 sm:p-5">
      {/* Daily briefing */}
      <section className="fd-panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              {greeting}, {firstName} <span aria-hidden>👋</span>
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {formatInTimeZone(now, timeZone, "EEEE d MMMM")} ·{" "}
              {scheduled.loading
                ? "Loading your day…"
                : todays.length === 0
                  ? "Nothing scheduled yet — a good day to plan."
                  : `${todays.length} scheduled, ${completedToday} done.`}
            </p>
            {!scheduled.loading && (highPriority.length > 0 || overdue.length > 0) ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                {highPriority.length > 0 ? (
                  <Badge variant="warning">
                    {highPriority.length} high priority
                  </Badge>
                ) : null}
                {overdue.length > 0 ? <Badge variant="danger">{overdue.length} overdue</Badge> : null}
              </p>
            ) : null}
          </div>

          <div className="w-full max-w-56 shrink-0 space-y-2 sm:w-56">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Today&apos;s progress
              </span>
              <span className="text-[13px] font-semibold tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} />
            <p className="text-[11px] text-muted-foreground">
              {completedToday} of {todays.length} complete
            </p>
          </div>
        </div>

        {/* Timeline of today */}
        <div className="border-t border-border">
          {scheduled.loading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : todays.length === 0 ? (
            <EmptyState
              icon={<CalendarClock />}
              title="Your day is open"
              description="Block out the work that matters before the day fills itself."
              action={
                <Button size="sm" onClick={() => openQuickAdd()}>
                  <Plus /> Plan something
                </Button>
              }
              className="py-10"
            />
          ) : (
            <ol className="divide-y divide-border">
              {todays.map((item) => {
                const time = item.startAt && !item.allDay
                  ? formatInTimeZone(new Date(item.startAt), timeZone, "HH:mm")
                  : "All day";
                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-14 shrink-0 text-[12px] font-medium tabular-nums text-muted-foreground">
                      {time}
                    </span>
                    <span className="min-w-0 flex-1">
                      <TaskBlock
                        item={item}
                        variant="row"
                        timeZone={timeZone}
                        onClick={() => setSelectedId(item.id)}
                        onToggleStatus={() => toggleStatus(item)}
                      />
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Overdue"
          icon={<AlertTriangle className="text-destructive" />}
          count={overdue.length}
          href="/tasks"
        >
          {scheduled.loading ? (
            <PanelSkeleton />
          ) : overdue.length === 0 ? (
            <PanelEmpty icon={<CheckCircle2 />} text="Nothing overdue. Good place to be." />
          ) : (
            <ul className="space-y-1.5">
              {overdue.slice(0, 6).map((item) => (
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
          )}
        </Panel>

        <Panel title="Upcoming" icon={<CalendarClock />} count={upcoming.length} href="/calendar">
          {scheduled.loading ? (
            <PanelSkeleton />
          ) : upcoming.length === 0 ? (
            <PanelEmpty icon={<CalendarClock />} text="The next few days are clear." />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((item) => {
                const anchor = item.startAt ?? item.dueAt;
                return (
                  <li key={item.id} className="flex items-center gap-2.5">
                    <span className="w-11 shrink-0 text-[11px] font-medium uppercase text-muted-foreground">
                      {anchor ? formatInTimeZone(new Date(anchor), timeZone, "EEE d") : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="min-w-0 flex-1 truncate text-left text-[13px] hover:text-primary"
                    >
                      {item.title}
                    </button>
                    {item.priority !== "NONE" ? (
                      <span className={`shrink-0 text-[10px] font-semibold ${PRIORITY_META[item.priority].className}`}>
                        {PRIORITY_META[item.priority].label}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Inbox" icon={<InboxIcon />} count={inbox.items.length} href="/inbox">
          {inbox.loading ? (
            <PanelSkeleton />
          ) : inbox.items.length === 0 ? (
            <PanelEmpty icon={<Sparkles />} text="No loose ideas. Capture one when it strikes." />
          ) : (
            <ul className="space-y-1.5">
              {inbox.items.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section className="fd-panel">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            <Avatar name={user.name} src={user.avatar} size="xs" />
            What the team is working on
          </h3>
          <Link href="/team" className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            Team <ArrowRight className="size-3" />
          </Link>
        </header>
        <div className="p-3">
          <PresenceList compact />
        </div>
      </section>

      <TaskDetailPanel
        itemId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={() => {
          void scheduled.reload();
          void inbox.reload();
        }}
      />
    </div>
  );
}

function Panel({
  title,
  icon,
  count,
  href,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fd-panel flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold [&_svg]:size-4">
          {icon}
          {title}
          {count > 0 ? <span className="text-[12px] font-normal tabular-nums text-muted-foreground">{count}</span> : null}
        </h3>
        <Link href={href} className="text-[12px] text-muted-foreground hover:text-foreground">
          View
        </Link>
      </header>
      <div className="flex-1 p-3">{children}</div>
    </section>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

function PanelEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
      <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
      <p className="text-[12px] text-muted-foreground">{text}</p>
    </div>
  );
}
