"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Wand2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import type { QuickAddDefaults } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface ParsedResponse {
  parsed: {
    title: string;
    startAt: string | null;
    dueAt: string | null;
    allDay: boolean;
    estimatedMinutes: number | null;
    priority: Priority;
    recurrence: {
      freq: RecurrenceFreq;
      interval: number;
      byWeekday?: number[];
      byMonthDay?: number;
      until?: string | null;
      count?: number | null;
    } | null;
    tagNames: string[];
    projectName: string | null;
    clarifications: string[];
  };
  timezone: string;
}

type Recurrence = NonNullable<ParsedResponse["parsed"]["recurrence"]>;

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
  const { workspaceId, projects, tags, members, user, refreshTags } = useApp();

  const [text, setText] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [clarifications, setClarifications] = React.useState<string[]>([]);
  const [expanded, setExpanded] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [priority, setPriority] = React.useState<Priority>("NONE");
  const [startLocal, setStartLocal] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);
  const [durationMinutes, setDurationMinutes] = React.useState("");
  const [recurrence, setRecurrence] = React.useState<Recurrence | null>(null);
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [pendingTagNames, setPendingTagNames] = React.useState<string[]>([]);
  const [reminderMinutes, setReminderMinutes] = React.useState("");
  const [isContent, setIsContent] = React.useState(false);

  const timezone = user.timezone;

  const reset = React.useCallback(() => {
    setText("");
    setTitle("");
    setDescription("");
    setProjectId(defaults.projectId ?? "");
    setAssigneeId("");
    setPriority("NONE");
    setStartLocal(defaults.startAt ? localInputValue(defaults.startAt, timezone, Boolean(defaults.allDay)) : "");
    setAllDay(Boolean(defaults.allDay));
    setDurationMinutes("");
    setRecurrence(null);
    setSelectedTagIds([]);
    setPendingTagNames([]);
    setReminderMinutes("");
    setClarifications([]);
    setExpanded(false);
    setIsContent(Boolean(defaults.isContent));
  }, [defaults, timezone]);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  /** Sends the typed sentence to the parser and pre-fills the structured fields. */
  const runParse = async (): Promise<void> => {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const { parsed } = await api.post<ParsedResponse>("/api/parse", { text, timezone });
      setTitle(parsed.title);
      setPriority(parsed.priority);
      setAllDay(parsed.allDay);
      setStartLocal(parsed.startAt ? localInputValue(new Date(parsed.startAt), timezone, parsed.allDay) : "");
      setDurationMinutes(parsed.estimatedMinutes ? String(parsed.estimatedMinutes) : "");
      setRecurrence(parsed.recurrence);
      setClarifications(parsed.clarifications);

      if (parsed.projectName) {
        const match = projects.find((p) => p.name.toLowerCase() === parsed.projectName?.toLowerCase());
        if (match) setProjectId(match.id);
        else setClarifications((current) => [...current, `No project named "${parsed.projectName}". Pick one below.`]);
      }
      if (parsed.tagNames.length > 0) {
        const known = tags.filter((t) => parsed.tagNames.includes(t.name));
        setSelectedTagIds(known.map((t) => t.id));
        setPendingTagNames(parsed.tagNames.filter((name) => !known.some((t) => t.name === name)));
      }
      setExpanded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that");
    } finally {
      setParsing(false);
    }
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const finalTitle = (title || text).trim();
    if (!finalTitle) {
      toast.error("Give the task a name");
      return;
    }
    setSaving(true);
    try {
      // Tags typed as #new are created on the fly, then attached by id.
      const createdTagIds: string[] = [];
      for (const name of pendingTagNames) {
        const created = await api.post<{ tag: { id: string } | null }>("/api/tags", { workspaceId, name });
        if (created.tag) createdTagIds.push(created.tag.id);
      }
      if (createdTagIds.length > 0) await refreshTags();

      const startAt = startLocal ? parseLocalInput(startLocal, timezone, allDay) : null;
      const estimated = durationMinutes ? Number(durationMinutes) : null;

      await api.post("/api/tasks", {
        workspaceId,
        title: finalTitle,
        description: description || null,
        projectId: projectId || null,
        assigneeId: assigneeId || null,
        priority,
        startAt: startAt?.toISOString() ?? null,
        dueAt: startAt && estimated && !allDay ? new Date(startAt.getTime() + estimated * 60_000).toISOString() : null,
        allDay,
        estimatedMinutes: estimated,
        recurrence: recurrence
          ? { ...recurrence, until: recurrence.until ?? null, count: recurrence.count ?? null }
          : null,
        tagIds: [...selectedTagIds, ...createdTagIds],
        reminders: reminderMinutes ? [{ minutesBefore: Number(reminderMinutes) }] : [],
        isContent,
        content: isContent ? { platform: "OTHER", contentType: "POST", contentStatus: "IDEA" } : null,
      });

      toast.success(startAt ? "Task scheduled" : "Added to your inbox");
      onOpenChange(false);
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
              Type it naturally — &ldquo;Build auth API tomorrow at 10am for 2 hours&rdquo; — or fill the fields.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <Input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void runParse();
                    }
                  }}
                  placeholder="Post LinkedIn content every Tuesday at 7pm #content"
                  autoFocus
                  className="h-10"
                />
                <Button type="button" variant="secondary" size="lg" loading={parsing} onClick={() => void runParse()}>
                  <Wand2 /> Parse
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium">#tag</span> · <span className="font-medium">+Project</span> ·{" "}
                <span className="font-medium">!urgent</span> · dates, durations and recurrence are all understood.
              </p>
            </div>

            {clarifications.length > 0 ? (
              <ul className="space-y-1 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
                {clarifications.map((question) => (
                  <li key={question} className="flex gap-2 text-[12px] text-warning">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                    {question}
                  </li>
                ))}
              </ul>
            ) : null}

            {!expanded ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
                Add details
              </Button>
            ) : (
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="qa-title">Task name</Label>
                  <Input id="qa-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
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

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="qa-start">{allDay ? "Date" : "Starts"}</Label>
                    <Input
                      id="qa-start"
                      type={allDay ? "date" : "datetime-local"}
                      value={startLocal}
                      onChange={(e) => setStartLocal(e.target.value)}
                    />
                    <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={allDay}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setAllDay(next);
                          setStartLocal((current) =>
                            current ? (next ? current.slice(0, 10) : `${current.slice(0, 10)}T09:00`) : current,
                          );
                        }}
                        className="size-3.5 accent-[var(--primary)]"
                      />
                      All day
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-duration">Duration (min)</Label>
                    <Input
                      id="qa-duration"
                      type="number"
                      min={0}
                      step={15}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      placeholder="60"
                      disabled={allDay}
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
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-reminder">Reminder</Label>
                    <NativeSelect
                      id="qa-reminder"
                      value={reminderMinutes}
                      onChange={(e) => setReminderMinutes(e.target.value)}
                    >
                      <option value="">None</option>
                      <option value="0">At start time</option>
                      <option value="10">10 minutes before</option>
                      <option value="30">30 minutes before</option>
                      <option value="60">1 hour before</option>
                      <option value="1440">1 day before</option>
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

                {tags.length > 0 || pendingTagNames.length > 0 ? (
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
                      {pendingTagNames.map((name) => (
                        <Badge key={name} variant="primary">
                          #{name} · new
                        </Badge>
                      ))}
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
            )}
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
