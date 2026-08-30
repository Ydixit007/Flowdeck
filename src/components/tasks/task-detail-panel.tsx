"use client";

import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  GitBranch,
  GitPullRequest,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp, splitItemId } from "@/lib/client/store";
import { formatInUserTz, localInputValue, parseLocalInput } from "@/lib/client/datetime";
import { formatMinutes } from "@/lib/utils";
import { describeRecurrence } from "@/lib/recurrence";
import type { CalendarItem } from "@/server/tasks";
import type { UserRef } from "@/server/users";
import { CONTENT_STATUSES, CONTENT_TYPES, PLATFORMS, PRIORITIES, TASK_STATUSES, VISIBILITIES } from "@/lib/types";
import type { ContentStatus, ContentType, Platform, Priority, TaskStatus, Visibility } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox, Progress, Separator, Skeleton } from "@/components/ui/misc";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CONTENT_STATUS_META, PLATFORM_META, PRIORITY_META, STATUS_META } from "@/components/tasks/task-meta";

type EditScope = "OCCURRENCE" | "FUTURE" | "SERIES";

interface TaskDetail {
  _id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  projectId: string | null;
  assigneeId: string | null;
  creatorId: string;
  tagIds: string[];
  startAt: string | null;
  dueAt: string | null;
  allDay: boolean;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  visibility: Visibility;
  isContent: boolean;
  recurrence: { freq: string; interval: number; byWeekday?: number[]; byMonthDay?: number; until?: string | null } | null;
  subtasks: Array<{ _id: string; title: string; done: boolean; order: number }>;
  dependsOnIds: string[];
  content: {
    platform: Platform;
    contentType: ContentType;
    contentStatus: ContentStatus;
    caption: string | null;
    body: string | null;
    publishAt: string | null;
  } | null;
  dev: {
    githubUrl: string | null;
    pullRequestUrl: string | null;
    issueUrl: string | null;
    branchName: string | null;
    technicalNotes: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface CommentRow {
  _id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  summary: string;
  actorId: string;
  createdAt: string;
}

export function TaskDetailPanel({
  itemId,
  onClose,
  onChanged,
}: {
  itemId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { user, projects, members, tags, workspaceId } = useApp();
  const { taskId, occurrenceStart } = React.useMemo(
    () => (itemId ? splitItemId(itemId) : { taskId: "", occurrenceStart: null }),
    [itemId],
  );

  const [task, setTask] = React.useState<TaskDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [comments, setComments] = React.useState<CommentRow[]>([]);
  const [authors, setAuthors] = React.useState<UserRef[]>([]);
  const [activity, setActivity] = React.useState<ActivityRow[]>([]);
  const [commentBody, setCommentBody] = React.useState("");
  const [newSubtask, setNewSubtask] = React.useState("");
  const [scopePrompt, setScopePrompt] = React.useState<null | { apply: (scope: EditScope) => Promise<void> }>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // Field edits collect here until Save, so typing a description does not write
  // a row per blur and bury the activity feed under "updated X" entries.
  const [pending, setPending] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);
  const dirty = Object.keys(pending).length > 0;

  const load = React.useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const [detail, commentData, activityData] = await Promise.all([
        api.get<{ task: TaskDetail }>(`/api/tasks/${taskId}`),
        api.get<{ comments: CommentRow[]; authors: UserRef[] }>(`/api/tasks/${taskId}/comments`),
        api.get<{ activity: ActivityRow[]; actors: UserRef[] }>(
          `/api/activity?workspaceId=${workspaceId}&taskId=${taskId}&limit=20`,
        ),
      ]);
      setTask(detail.task);
      setComments(commentData.comments);
      setAuthors(commentData.authors);
      setActivity(activityData.activity);
      setAuthors((current) => [...current, ...activityData.actors]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the task");
    } finally {
      setLoading(false);
    }
  }, [taskId, workspaceId]);

  React.useEffect(() => {
    if (itemId) void load();
    else setTask(null);
  }, [itemId, load]);

  const nameFor = (id: string): UserRef | undefined => {
    const member = members.find((m) => m.id === id);
    if (member) return member;
    return authors.find((a) => a.id === id);
  };

  /** Applies a patch. Recurring tasks ask which occurrences it should affect. */
  const patch = async (body: Record<string, unknown>, forceScope?: EditScope): Promise<void> => {
    if (!task) return;
    const send = async (scope: EditScope): Promise<void> => {
      await api.patch(`/api/tasks/${task._id}`, {
        ...body,
        scope,
        occurrenceStart: scope === "SERIES" ? null : occurrenceStart,
      });
      await load();
      onChanged?.();
    };

    if (task.recurrence && occurrenceStart && !forceScope) {
      setScopePrompt({ apply: send });
      return;
    }
    try {
      await send(forceScope ?? "SERIES");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  };

  /** Buffers a field edit locally; written only when Save is pressed. */
  const edit = (body: Record<string, unknown>): void => {
    setTask((current) => (current ? ({ ...current, ...body } as TaskDetail) : current));
    setPending((current) => ({ ...current, ...body }));
  };

  const save = async (): Promise<void> => {
    if (!dirty || saving) return;
    setSaving(true);
    const body = pending;
    setPending({});
    try {
      await patch(body);
    } catch {
      setPending((current) => ({ ...body, ...current }));
    } finally {
      setSaving(false);
    }
  };

  const discard = (): void => {
    setPending({});
    void load();
  };

  /** Closing with unsaved field edits writes them, so a close is never a silent
   *  data loss; one request, not one per field. */
  const closeWithSave = (): void => {
    if (dirty) void save();
    onClose();
  };

  const addComment = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!task || !commentBody.trim()) return;
    const body = commentBody.trim();
    setCommentBody("");
    try {
      await api.post(`/api/tasks/${task._id}/comments`, { body });
      await load();
    } catch (error) {
      setCommentBody(body);
      toast.error(error instanceof Error ? error.message : "Could not post the comment");
    }
  };

  const toggleSubtask = async (subtaskId: string): Promise<void> => {
    if (!task) return;
    const next = task.subtasks.map((s) => (s._id === subtaskId ? { ...s, done: !s.done } : s));
    setTask({ ...task, subtasks: next });
    try {
      await api.patch(`/api/tasks/${task._id}`, {
        scope: "SERIES",
        subtasks: next.map((s) => ({ _id: s._id, title: s.title, done: s.done })),
      });
      onChanged?.();
    } catch (error) {
      void load();
      toast.error(error instanceof Error ? error.message : "Could not update the subtask");
    }
  };

  const addSubtask = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!task || !newSubtask.trim()) return;
    const next = [
      ...task.subtasks.map((s) => ({ _id: s._id, title: s.title, done: s.done })),
      { title: newSubtask.trim(), done: false },
    ];
    setNewSubtask("");
    try {
      await api.patch(`/api/tasks/${task._id}`, { scope: "SERIES", subtasks: next });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the subtask");
    }
  };

  const remove = async (): Promise<void> => {
    if (!task) return;
    try {
      const suffix = occurrenceStart ? `?occurrenceStart=${encodeURIComponent(occurrenceStart)}` : "";
      await api.delete(`/api/tasks/${task._id}${suffix}`);
      toast.success(occurrenceStart ? "Occurrence removed" : "Task deleted");
      setConfirmDelete(false);
      onChanged?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  };

  const doneSubtasks = task?.subtasks.filter((s) => s.done).length ?? 0;
  const totalSubtasks = task?.subtasks.length ?? 0;
  const taskActivity = activity;

  return (
    <>
      <Dialog open={Boolean(itemId)} onOpenChange={(next) => (next ? undefined : closeWithSave())}>
        <DialogContent size="xl" className="top-[5vh] max-h-[90vh] overflow-hidden p-0" hideClose>
          {loading && !task ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !task ? null : (
            <div className="flex max-h-[90vh] flex-col">
              <DialogTitle className="sr-only">{task.title}</DialogTitle>
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <NativeSelect
                  aria-label="Status"
                  value={task.status}
                  onChange={(e) => void patch({ status: e.target.value })}
                  className="h-8 w-auto min-w-32 text-[12px]"
                >
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </NativeSelect>
                {task.recurrence ? (
                  <Badge variant="primary">
                    <Repeat className="size-3" />
                    {describeRecurrence({
                      freq: task.recurrence.freq as never,
                      interval: task.recurrence.interval,
                      byWeekday: task.recurrence.byWeekday,
                      byMonthDay: task.recurrence.byMonthDay,
                      until: task.recurrence.until ? new Date(task.recurrence.until) : null,
                    })}
                  </Badge>
                ) : null}
                {occurrenceStart ? (
                  <Badge variant="outline">
                    <CalendarClock className="size-3" />
                    {formatInUserTz(occurrenceStart, user.timezone, "EEE d MMM")}
                  </Badge>
                ) : null}
                <div className="flex-1" />
                {dirty ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
                      Discard
                    </Button>
                    <Button size="sm" onClick={() => void save()} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </>
                ) : null}
                <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} aria-label="Delete task">
                  <Trash2 />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={closeWithSave} aria-label="Close">
                  <X />
                </Button>
              </div>

              <div className="fd-scroll-thin grid flex-1 gap-0 overflow-y-auto md:grid-cols-[1fr_17rem]">
                <div className="min-w-0 space-y-5 p-5">
                  <InlineTitle value={task.title} onSave={(value) => edit({ title: value })} />

                  <InlineDescription
                    value={task.description ?? ""}
                    onSave={(value) => edit({ description: value || null })}
                  />

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Subtasks
                      </h3>
                      {totalSubtasks > 0 ? (
                        <span className="text-[12px] tabular-nums text-muted-foreground">
                          {doneSubtasks} / {totalSubtasks} completed
                        </span>
                      ) : null}
                    </div>
                    {totalSubtasks > 0 ? (
                      <Progress value={(doneSubtasks / totalSubtasks) * 100} />
                    ) : null}
                    <ul className="space-y-0.5">
                      {task.subtasks
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((subtask) => (
                          <li key={subtask._id} className="flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-muted">
                            <Checkbox
                              checked={subtask.done}
                              onCheckedChange={() => void toggleSubtask(subtask._id)}
                              aria-label={subtask.title}
                            />
                            <span
                              className={`flex-1 text-[13px] ${subtask.done ? "text-muted-foreground line-through" : ""}`}
                            >
                              {subtask.title}
                            </span>
                          </li>
                        ))}
                    </ul>
                    <form onSubmit={addSubtask} className="flex gap-1.5">
                      <Input
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        placeholder="Add a subtask"
                        className="h-8 text-[13px]"
                      />
                      <Button type="submit" variant="secondary" size="icon-sm" aria-label="Add subtask">
                        <Plus />
                      </Button>
                    </form>
                  </section>

                  {task.isContent && task.content ? (
                    <ContentSection task={task} onPatch={edit} />
                  ) : null}

                  <DevSection task={task} onPatch={edit} />

                  <Separator />

                  <section className="space-y-3">
                    <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <MessageSquare className="size-3.5" /> Comments
                    </h3>
                    <ul className="space-y-3">
                      {comments.map((comment) => {
                        const author = nameFor(comment.authorId);
                        return (
                          <li key={comment._id} className="flex gap-2.5">
                            <Avatar name={author?.name ?? "Someone"} src={author?.avatar} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="flex items-baseline gap-1.5">
                                <span className="text-[13px] font-medium">{author?.name ?? "Someone"}</span>
                                <span className="text-[11px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                </span>
                              </p>
                              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                                {renderMentions(comment.body)}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                      {comments.length === 0 ? (
                        <li className="text-[13px] text-muted-foreground">No comments yet.</li>
                      ) : null}
                    </ul>
                    <form onSubmit={addComment} className="space-y-2">
                      <Textarea
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder="Leave a comment — use @username to mention someone"
                        className="min-h-16 text-[13px]"
                      />
                      <div className="flex justify-end">
                        <Button type="submit" size="sm" disabled={!commentBody.trim()}>
                          Comment
                        </Button>
                      </div>
                    </form>
                  </section>

                  {taskActivity.length > 0 ? (
                    <section className="space-y-2">
                      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Activity
                      </h3>
                      <ul className="space-y-1.5">
                        {taskActivity.slice(0, 8).map((row) => {
                          const actor = nameFor(row.actorId);
                          return (
                            <li key={row.id} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                              <Avatar name={actor?.name ?? "Someone"} src={actor?.avatar} size="xs" />
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium text-foreground">{actor?.name ?? "Someone"}</span>{" "}
                                {row.summary}
                              </span>
                              <span className="shrink-0">
                                {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ) : null}
                </div>

                <aside className="space-y-3.5 border-t border-border bg-surface-sunken p-4 md:border-l md:border-t-0">
                  <Field label="Priority">
                    <NativeSelect
                      value={task.priority}
                      onChange={(e) => edit({ priority: e.target.value })}
                      className="h-8 text-[12px]"
                    >
                      {PRIORITIES.map((value) => (
                        <option key={value} value={value}>
                          {PRIORITY_META[value].label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Project">
                    <NativeSelect
                      value={task.projectId ?? ""}
                      onChange={(e) => edit({ projectId: e.target.value || null })}
                      className="h-8 text-[12px]"
                    >
                      <option value="">No project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Assignee">
                    <NativeSelect
                      value={task.assigneeId ?? ""}
                      onChange={(e) => edit({ assigneeId: e.target.value || null })}
                      className="h-8 text-[12px]"
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label={task.allDay ? "Start date" : "Starts"}>
                    <Input
                      type={task.allDay ? "date" : "datetime-local"}
                      className="h-8 text-[12px]"
                      value={task.startAt ? localInputValue(new Date(task.startAt), user.timezone, task.allDay) : ""}
                      onChange={(e) =>
                        edit({
                          startAt: e.target.value
                            ? parseLocalInput(e.target.value, user.timezone, task.allDay).toISOString()
                            : null,
                        })
                      }
                    />
                  </Field>

                  {/* All-day tasks still have a deadline; only the time is dropped. */}
                  <Field label={task.allDay ? "Due date" : "Ends"}>
                    <Input
                      type={task.allDay ? "date" : "datetime-local"}
                      className="h-8 text-[12px]"
                      value={task.dueAt ? localInputValue(new Date(task.dueAt), user.timezone, task.allDay) : ""}
                      onChange={(e) =>
                        edit({
                          dueAt: e.target.value
                            ? parseLocalInput(e.target.value, user.timezone, task.allDay).toISOString()
                            : null,
                        })
                      }
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Estimate (m)">
                      <Input
                        type="number"
                        min={0}
                        step={15}
                        className="h-8 text-[12px]"
                        defaultValue={task.estimatedMinutes ?? ""}
                        onBlur={(e) =>
                          edit({ estimatedMinutes: e.target.value ? Number(e.target.value) : null })
                        }
                      />
                    </Field>
                    <Field label="Actual (m)">
                      <Input
                        type="number"
                        min={0}
                        step={15}
                        className="h-8 text-[12px]"
                        defaultValue={task.actualMinutes ?? ""}
                        onBlur={(e) => edit({ actualMinutes: e.target.value ? Number(e.target.value) : null })}
                      />
                    </Field>
                  </div>

                  <Field label="Visibility">
                    <NativeSelect
                      value={task.visibility}
                      onChange={(e) => edit({ visibility: e.target.value })}
                      className="h-8 text-[12px]"
                    >
                      {VISIBILITIES.map((value) => (
                        <option key={value} value={value}>
                          {value.charAt(0) + value.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Tags">
                    <div className="flex flex-wrap gap-1">
                      {tags.length === 0 ? (
                        <span className="text-[12px] text-muted-foreground">No tags yet</span>
                      ) : (
                        tags.map((tag) => {
                          const active = task.tagIds.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                edit({
                                  tagIds: active
                                    ? task.tagIds.filter((id) => id !== tag.id)
                                    : [...task.tagIds, tag.id],
                                })
                              }
                              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                active ? "border-transparent text-white" : "border-border text-muted-foreground hover:bg-muted"
                              }`}
                              style={active ? { background: tag.color } : undefined}
                            >
                              #{tag.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </Field>

                  <Separator />
                  <dl className="space-y-1 text-[11px] text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <dt>Created</dt>
                      <dd>{format(new Date(task.createdAt), "d MMM yyyy")}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Updated</dt>
                      <dd>{formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}</dd>
                    </div>
                    {task.completedAt ? (
                      <div className="flex justify-between gap-2">
                        <dt>Completed</dt>
                        <dd>{format(new Date(task.completedAt), "d MMM yyyy")}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-2">
                      <dt>Estimate</dt>
                      <dd>{formatMinutes(task.estimatedMinutes)}</dd>
                    </div>
                  </dl>
                </aside>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(scopePrompt)} onOpenChange={(next) => (next ? undefined : setScopePrompt(null))}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>This task repeats</DialogTitle>
            <DialogDescription>Which occurrences should this change apply to?</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            {(
              [
                ["OCCURRENCE", "This occurrence only"],
                ["FUTURE", "This and all future occurrences"],
                ["SERIES", "The entire series"],
              ] as const
            ).map(([scope, label]) => (
              <Button
                key={scope}
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  const apply = scopePrompt?.apply;
                  setScopePrompt(null);
                  if (apply) {
                    void apply(scope).catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : "Could not save"),
                    );
                  }
                }}
              >
                <Check /> {label}
              </Button>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{occurrenceStart ? "Remove this occurrence?" : "Delete this task?"}</DialogTitle>
            <DialogDescription>
              {occurrenceStart
                ? "Only this date is removed. The rest of the series stays."
                : "This also deletes its subtasks and comments. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              {occurrenceStart ? "Remove occurrence" : "Delete task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function InlineTitle({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft.trim() && draft !== value && onSave(draft.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(value);
      }}
      aria-label="Task title"
      className="w-full rounded-md bg-transparent px-1 py-0.5 text-lg font-semibold tracking-tight outline-none transition-colors hover:bg-muted focus:bg-muted"
    />
  );
}

function InlineDescription({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <Textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      placeholder="Add a description…"
      className="min-h-20 border-transparent bg-transparent px-1 text-[13px] leading-relaxed hover:border-border focus-visible:border-ring"
    />
  );
}

function ContentSection({
  task,
  onPatch,
}: {
  task: TaskDetail;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const content = task.content;
  if (!content) return null;
  const update = (patch: Record<string, unknown>): void => {
    onPatch({ isContent: true, content: { ...content, ...patch } });
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface-sunken p-3.5">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: PLATFORM_META[content.platform].color }} />
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Content</h3>
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            CONTENT_STATUS_META[content.contentStatus].className
          }`}
        >
          {CONTENT_STATUS_META[content.contentStatus].label}
        </span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Field label="Platform">
          <NativeSelect
            value={content.platform}
            onChange={(e) => update({ platform: e.target.value })}
            className="h-8 text-[12px]"
          >
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_META[platform].label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Type">
          <NativeSelect
            value={content.contentType}
            onChange={(e) => update({ contentType: e.target.value })}
            className="h-8 text-[12px]"
          >
            {CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0) + type.slice(1).toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status">
          <NativeSelect
            value={content.contentStatus}
            onChange={(e) => update({ contentStatus: e.target.value })}
            className="h-8 text-[12px]"
          >
            {CONTENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CONTENT_STATUS_META[status].label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Caption">
        <Textarea
          defaultValue={content.caption ?? ""}
          onBlur={(e) => update({ caption: e.target.value || null })}
          placeholder="Hook, caption, hashtags…"
          className="min-h-16 text-[13px]"
        />
      </Field>
      <Field label="Content body">
        <Textarea
          defaultValue={content.body ?? ""}
          onBlur={(e) => update({ body: e.target.value || null })}
          placeholder="Script, outline or full post…"
          className="min-h-24 text-[13px]"
        />
      </Field>
    </section>
  );
}

function DevSection({
  task,
  onPatch,
}: {
  task: TaskDetail;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = React.useState(
    Boolean(task.dev?.githubUrl || task.dev?.branchName || task.dev?.pullRequestUrl || task.dev?.technicalNotes),
  );
  const dev = task.dev ?? {
    githubUrl: null,
    pullRequestUrl: null,
    issueUrl: null,
    branchName: null,
    technicalNotes: null,
  };
  const update = (patch: Record<string, unknown>): void => {
    onPatch({ dev: { ...dev, ...patch } });
  };

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <GitBranch /> Add development details
      </Button>
    );
  }

  return (
    <section className="space-y-2.5 rounded-lg border border-border bg-surface-sunken p-3.5">
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <GitPullRequest className="size-3.5" /> Development
      </h3>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Branch">
          <Input
            defaultValue={dev.branchName ?? ""}
            onBlur={(e) => update({ branchName: e.target.value || null })}
            placeholder="feat/auth-api"
            className="h-8 text-[12px]"
          />
        </Field>
        <Field label="Pull request">
          <Input
            type="url"
            defaultValue={dev.pullRequestUrl ?? ""}
            onBlur={(e) => update({ pullRequestUrl: e.target.value || null })}
            placeholder="https://github.com/…/pull/12"
            className="h-8 text-[12px]"
          />
        </Field>
        <Field label="Issue">
          <Input
            type="url"
            defaultValue={dev.issueUrl ?? ""}
            onBlur={(e) => update({ issueUrl: e.target.value || null })}
            placeholder="https://github.com/…/issues/34"
            className="h-8 text-[12px]"
          />
        </Field>
        <Field label="Repository">
          <Input
            type="url"
            defaultValue={dev.githubUrl ?? ""}
            onBlur={(e) => update({ githubUrl: e.target.value || null })}
            placeholder="https://github.com/you/repo"
            className="h-8 text-[12px]"
          />
        </Field>
      </div>
      <Field label="Technical notes">
        <Textarea
          defaultValue={dev.technicalNotes ?? ""}
          onBlur={(e) => update({ technicalNotes: e.target.value || null })}
          placeholder="Approach, gotchas, migration steps…"
          className="min-h-20 text-[13px]"
        />
      </Field>
      {dev.pullRequestUrl || dev.issueUrl ? (
        <div className="flex flex-wrap gap-1.5">
          {dev.pullRequestUrl ? (
            <a
              href={dev.pullRequestUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Link2 className="size-3" /> Pull request
            </a>
          ) : null}
          {dev.issueUrl ? (
            <a
              href={dev.issueUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="size-3" /> Issue
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Highlights @mentions without rendering user-supplied HTML. */
function renderMentions(body: string): React.ReactNode[] {
  return body.split(/(@[a-z0-9_.-]{3,32})/gi).map((part, index) =>
    part.startsWith("@") ? (
      <span key={`${part}-${index}`} className="font-medium text-primary">
        {part}
      </span>
    ) : (
      <React.Fragment key={`text-${index}`}>{part}</React.Fragment>
    ),
  );
}
