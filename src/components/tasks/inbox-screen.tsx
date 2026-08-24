"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarPlus, Inbox as InboxIcon, Send } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp, useTasks } from "@/lib/client/store";
import { parseLocalInput } from "@/lib/client/datetime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TaskBlock } from "@/components/calendar/task-block";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import type { CalendarItem } from "@/server/tasks";

/** Fast capture: type an idea, hit enter, schedule it later. */
export function InboxScreen() {
  const { workspaceId, user } = useApp();
  const { items, loading, reload, mutateItem } = useTasks({ unscheduled: true }, ["inbox"]);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const capture = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    setSaving(true);
    try {
      await api.post("/api/tasks", { workspaceId, title, visibility: "PRIVATE" });
      await reload();
    } catch (error) {
      setDraft(title);
      toast.error(error instanceof Error ? error.message : "Could not save that");
    } finally {
      setSaving(false);
    }
  };

  const schedule = async (item: CalendarItem, value: string, allDay: boolean): Promise<void> => {
    if (!value) return;
    const startAt = parseLocalInput(value, user.timezone, allDay);
    await mutateItem(item.id, { startAt: startAt.toISOString(), allDay }, () =>
      api.patch(`/api/tasks/${item.taskId}`, { startAt: startAt.toISOString(), allDay, scope: "SERIES" }),
    );
    toast.success("Scheduled");
    await reload();
  };

  const toggleStatus = (item: CalendarItem): void => {
    const nextStatus = item.status === "DONE" ? "TODO" : "DONE";
    void mutateItem(item.id, { status: nextStatus }, () =>
      api.patch(`/api/tasks/${item.taskId}`, { status: nextStatus, scope: "SERIES" }),
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-5">
      <form onSubmit={capture} className="fd-panel flex items-center gap-2 p-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Capture anything — “Maybe make a video about Next.js caching”"
          className="h-9 border-transparent bg-transparent focus-visible:border-transparent focus-visible:ring-0"
          autoFocus
        />
        <Button type="submit" size="sm" loading={saving} disabled={!draft.trim()}>
          <Send /> Add
        </Button>
      </form>

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="fd-panel">
          <EmptyState
            icon={<InboxIcon />}
            title="Inbox zero"
            description="Dump half-formed ideas here without deciding when. Schedule them when you're ready."
          />
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1">
                <TaskBlock
                  item={item}
                  variant="row"
                  timeZone={user.timezone}
                  onClick={() => setSelectedId(item.id)}
                  onToggleStatus={() => toggleStatus(item)}
                />
              </span>
              <SchedulePopover onSchedule={(value, allDay) => void schedule(item, value, allDay)} />
            </li>
          ))}
        </ul>
      )}

      <TaskDetailPanel itemId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void reload()} />
    </div>
  );
}

function SchedulePopover({ onSchedule }: { onSchedule: (value: string, allDay: boolean) => void }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon-sm" aria-label="Schedule this item">
          <CalendarPlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2.5">
        <p className="text-[12px] font-medium">Schedule</p>
        <Input
          type={allDay ? "date" : "datetime-local"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 text-[12px]"
        />
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => {
              setAllDay(event.target.checked);
              setValue("");
            }}
            className="size-3.5 accent-[var(--primary)]"
          />
          All day
        </label>
        <Button
          size="sm"
          className="w-full"
          disabled={!value}
          onClick={() => {
            onSchedule(value, allDay);
            setOpen(false);
            setValue("");
          }}
        >
          Put it on the calendar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
