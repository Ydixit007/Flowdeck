"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import type { QuickAddDefaults } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRIORITIES, RECURRENCE_FREQS, type Priority, type RecurrenceFreq } from "@/lib/types";
import { PRIORITY_META } from "@/components/tasks/task-meta";
import { describeRecurrence } from "@/lib/recurrence";
import { localInputValue, parseLocalInput } from "@/lib/client/datetime";

interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;
  byWeekday?: number[];
  byMonthDay?: number;
  until?: string | null;
  count?: number | null;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function QuickAddDialog({
  open,
  onOpenChange,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: QuickAddDefaults;
}) {
  const router = useRouter();
  const { workspaceId, projects, tags, members, user, invalidateTasks } = useApp();

  const [saving, setSaving] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState(user.id);
  const [priority, setPriority] = React.useState<Priority>("NONE");
  const [startLocal, setStartLocal] = React.useState("");
  const [allDay, setAllDay] = React.useState(true);
  const [dueLocal, setDueLocal] = React.useState("");
  const [recurrence, setRecurrence] = React.useState<Recurrence | null>(null);
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [isContent, setIsContent] = React.useState(false);

  const timezone = user.timezone;

  const reset = React.useCallback(() => {
    setTitle("");
    setDescription("");
    setProjectId(defaults.projectId ?? "");
    setAssigneeId(user.id);
    setPriority("NONE");
    const isAllDay = defaults.allDay ?? true;
    setAllDay(isAllDay);
    setStartLocal(defaults.startAt ? localInputValue(defaults.startAt, timezone, Boolean(isAllDay)) : "");
    const defaultEnd = defaults.dueAt
      ? defaults.dueAt
      : defaults.startAt && !isAllDay
        ? new Date(defaults.startAt.getTime() + 30 * 60_000)
        : null;
    setDueLocal(defaultEnd ? localInputValue(defaultEnd, timezone, Boolean(isAllDay)) : "");
    setRecurrence(null);
    setSelectedTagIds([]);
    setIsContent(Boolean(defaults.isContent));
  }, [defaults, timezone, user.id]);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const finalTitle = title.trim();
    if (!finalTitle) {
      toast.error("Give the task a name");
      return;
    }
    setSaving(true);
    try {
      const startAt = startLocal ? parseLocalInput(startLocal, timezone, allDay) : null;
      const dueAt = dueLocal ? parseLocalInput(dueLocal, timezone, allDay) : null;

      await api.post("/api/tasks", {
        workspaceId,
        title: finalTitle,
        description: description || null,
        projectId: projectId || null,
        assigneeId: assigneeId || null,
        priority,
        startAt: startAt?.toISOString() ?? null,
        dueAt: dueAt?.toISOString() ?? null,
        allDay,
        recurrence: recurrence
          ? { ...recurrence, until: recurrence.until ?? null, count: recurrence.count ?? null }
          : null,
        tagIds: selectedTagIds,
        isContent,
        content: isContent ? { platform: "OTHER", contentType: "POST", contentStatus: "IDEA" } : null,
      });

      toast.success(startAt ? "Task scheduled" : "Added to your inbox");
      onOpenChange(false);
      invalidateTasks();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the task");
    } finally {
      setSaving(false);
    }
  };

  const toggleWeekday = (day: number): void => {
    setRecurrence((current) => {
      if (!current) return current;
      const days = new Set(current.byWeekday ?? []);
      if (days.has(day)) days.delete(day);
      else days.add(day);
      return { ...current, byWeekday: [...days].sort((a, b) => a - b) };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>
              Name the task and fill in whatever you already know.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="qa-title">Task name</Label>
                  <Input
                    id="qa-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Post LinkedIn content"
                    autoFocus
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qa-description">Description</Label>
                  <Textarea
                    id="qa-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional notes, links, acceptance criteria…"
                    className="min-h-16"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-project">Project</Label>
                    <NativeSelect id="qa-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                      <option value="">No project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-assignee">Assignee</Label>
                    <NativeSelect id="qa-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                          {member.id === user.id ? " (you)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-start">{allDay ? "Start date" : "Starts"}</Label>
                    <Input
                      id="qa-start"
                      type={allDay ? "date" : "datetime-local"}
                      value={startLocal}
                      onChange={(e) => setStartLocal(e.target.value)}
                    />
                    <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!allDay}
                        onChange={(e) => {
                          const next = !e.target.checked;
                          setAllDay(next);
                          if (!next) {
                            const baseDate = startLocal
                              ? startLocal.slice(0, 10)
                              : localInputValue(new Date(), timezone, true);
                            setStartLocal(`${baseDate}T09:00`);
                            setDueLocal(`${baseDate}T09:30`);
                          } else {
                            setStartLocal((c) => (c ? c.slice(0, 10) : ""));
                            setDueLocal((c) => (c ? c.slice(0, 10) : ""));
                          }
                        }}
                        className="size-3.5 accent-[var(--primary)]"
                      />
                      Set a time of day
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-due">{allDay ? "End date" : "Ends"}</Label>
                    <Input
                      id="qa-due"
                      type={allDay ? "date" : "datetime-local"}
                      value={dueLocal}
                      min={startLocal || undefined}
                      onChange={(e) => setDueLocal(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-priority">Priority</Label>
                    <NativeSelect
                      id="qa-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as Priority)}
                    >
                      {PRIORITIES.map((value) => (
                        <option key={value} value={value}>
                          {PRIORITY_META[value].label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qa-recurrence">Repeats</Label>
                  <NativeSelect
                    id="qa-recurrence"
                    value={recurrence?.freq ?? ""}
                    onChange={(e) => {
                      const value = e.target.value as RecurrenceFreq | "";
                      setRecurrence(value ? { freq: value, interval: 1 } : null);
                    }}
                  >
                    <option value="">Does not repeat</option>
                    {RECURRENCE_FREQS.map((freq) => (
                      <option key={freq} value={freq}>
                        {freq.charAt(0) + freq.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </NativeSelect>
                  {recurrence && ["WEEKLY", "BIWEEKLY", "CUSTOM"].includes(recurrence.freq) ? (
                    <div className="flex gap-1 pt-1">
                      {WEEKDAY_LABELS.map((label, day) => {
                        const active = (recurrence.byWeekday ?? []).includes(day);
                        return (
                          <button
                            key={`${label}-${day}`}
                            type="button"
                            onClick={() => toggleWeekday(day)}
                            aria-pressed={active}
                            className={`size-7 rounded-md border text-[11px] font-medium transition-colors ${
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {recurrence && recurrence.freq === "MONTHLY" ? (
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      placeholder="Day of month"
                      value={recurrence.byMonthDay ?? ""}
                      onChange={(e) =>
                        setRecurrence((current) =>
                          current ? { ...current, byMonthDay: Number(e.target.value) || undefined } : current,
                        )
                      }
                    />
                  ) : null}
                  {recurrence ? (
                    <p className="text-[11px] text-muted-foreground">
                      {describeRecurrence({
                        ...recurrence,
                        until: recurrence.until ? new Date(recurrence.until) : null,
                      })}
                    </p>
                  ) : null}
                </div>

                {tags.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => {
                        const active = selectedTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() =>
                              setSelectedTagIds((current) =>
                                active ? current.filter((id) => id !== tag.id) : [...current, tag.id],
                              )
                            }
                            aria-pressed={active}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              active ? "border-transparent text-white" : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                            style={active ? { background: tag.color } : undefined}
                          >
                            #{tag.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={isContent}
                    onChange={(e) => setIsContent(e.target.checked)}
                    className="size-3.5 accent-[var(--primary)]"
                  />
                  Track this as social content
                </label>
              </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
