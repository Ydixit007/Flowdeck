"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarRange,
  Flag,
  GitBranch,
  ListTodo,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { useApp, useTasks, splitItemId } from "@/lib/client/store";
import { useShell } from "@/components/layout/app-shell";
import { dayStart } from "@/components/calendar/range";
import type { CalendarItem } from "@/server/tasks";
import type { UserRef } from "@/server/users";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Progress, Separator, Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TaskBlock } from "@/components/calendar/task-block";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { ProjectIcon, PROJECT_ICON_NAMES, PROJECT_COLORS } from "@/components/layout/project-icon";
import { PROJECT_STATUSES } from "@/lib/types";
import { RoadmapTimeline } from "@/components/projects/roadmap-timeline";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";

type Tab = "overview" | "backlog" | "active" | "roadmap";

interface ActivityRow {
  id: string;
  summary: string;
  actorId: string;
  createdAt: string;
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const { projects, user, workspaceId, refreshProjects, members } = useApp();
  const { openQuickAdd, setPageTitle } = useShell();
  const project = projects.find((p) => p.id === projectId);
  const timeZone = user.timezone;

  const [tab, setTab] = React.useState<Tab>("overview");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [activity, setActivity] = React.useState<ActivityRow[]>([]);
  const [actors, setActors] = React.useState<UserRef[]>([]);

  const from = React.useMemo(() => new Date(dayStart(new Date(), timeZone).getTime() - 120 * 86_400_000), [timeZone]);
  const to = React.useMemo(() => new Date(dayStart(new Date(), timeZone).getTime() + 240 * 86_400_000), [timeZone]);

  const { items, loading, reload, mutateItem } = useTasks({ from, to, projectId: [projectId] }, [
    projectId,
    from.toISOString(),
    to.toISOString(),
  ]);

  React.useEffect(() => {
    if (project) setPageTitle(project.name);
  }, [project, setPageTitle]);

  React.useEffect(() => {
    if (!workspaceId) return;
    void api
      .get<{ activity: ActivityRow[]; actors: UserRef[] }>(`/api/activity${qs({ workspaceId, projectId, limit: 20 })}`)
      .then((data) => {
        setActivity(data.activity);
        setActors(data.actors);
      })
      .catch(() => undefined);
  }, [workspaceId, projectId]);

  const now = new Date();
  const done = items.filter((item) => item.status === "DONE");
  const open = items.filter((item) => item.status !== "DONE" && item.status !== "CANCELLED");
  const overdue = open.filter((item) => {
    const due = item.dueAt ?? item.startAt;
    return Boolean(due && new Date(due) < now);
  });
  const backlog = open.filter((item) => !item.startAt && !item.dueAt);
  const activeWork = open.filter((item) => item.status === "IN_PROGRESS" || Boolean(item.startAt));
  const upcoming = open
    .filter((item) => {
      const anchor = item.startAt ?? item.dueAt;
      return Boolean(anchor && new Date(anchor) >= now);
    })
    .slice(0, 8);

  const percent = items.length > 0 ? Math.round((done.length / items.length) * 100) : 0;

  const toggleStatus = (item: CalendarItem): void => {
    const { taskId, occurrenceStart } = splitItemId(item.id);
    const nextStatus = item.status === "DONE" ? "TODO" : "DONE";
    void mutateItem(item.id, { status: nextStatus }, () =>
      api.patch(`/api/tasks/${taskId}`, {
        status: nextStatus,
        scope: occurrenceStart ? "OCCURRENCE" : "SERIES",
        occurrenceStart,
      }),
    );
  };

  const updateProject = async (patch: Record<string, unknown>): Promise<void> => {
    try {
      await api.patch(`/api/projects/${projectId}`, patch);
      await refreshProjects();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the project");
    }
  };

  const addMilestone = async (title: string, targetDate: string): Promise<void> => {
    try {
      await api.post(`/api/projects/${projectId}/milestones`, {
        title,
        targetDate: targetDate ? new Date(`${targetDate}T12:00:00Z`).toISOString() : null,
      });
      await refreshProjects();
      toast.success("Milestone added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the milestone");
    }
  };

  const removeMilestone = async (milestoneId: string): Promise<void> => {
    try {
      await api.delete(`/api/projects/${projectId}/milestones?milestoneId=${milestoneId}`);
      await refreshProjects();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the milestone");
    }
  };

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 p-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5">
      <header className="fd-panel p-4">
        <div className="flex flex-wrap items-start gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Change project icon and colour"
                title="Change icon and colour"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl transition-opacity hover:opacity-80"
                style={{ background: `${project.color}1a` }}
              >
                <ProjectIcon name={project.icon} color={project.color} className="size-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-3 p-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Icon</Label>
                <div className="flex flex-wrap gap-1">
                  {PROJECT_ICON_NAMES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => void updateProject({ icon: name })}
                      aria-pressed={project.icon === name}
                      aria-label={name}
                      className={`flex size-8 items-center justify-center rounded-md border transition-colors ${
                        project.icon === name ? "border-primary bg-accent" : "border-border hover:bg-muted"
                      }`}
                    >
                      <ProjectIcon name={name} color={project.color} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Colour</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PROJECT_COLORS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => void updateProject({ color: value })}
                      aria-pressed={project.color === value}
                      aria-label={`Colour ${value}`}
                      className={`size-6 rounded-full border-2 transition-transform ${
                        project.color === value ? "scale-110 border-foreground" : "border-transparent"
                      }`}
                      style={{ background: value }}
                    />
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold tracking-tight">{project.name}</h1>
            {project.description ? (
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {project.targetDate ? (
                <Badge variant="outline">
                  <Target className="size-3" /> Target{" "}
                  {formatInTimeZone(new Date(project.targetDate), timeZone, "d MMM yyyy")}
                </Badge>
              ) : null}
              {overdue.length > 0 ? <Badge variant="danger">{overdue.length} overdue</Badge> : null}
              {project.repoUrl ? (
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <GitBranch className="size-3" /> Repository
                </a>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="Project status"
              value={project.status}
              onChange={(event) => void updateProject({ status: event.target.value })}
              className="h-8 w-32 text-[12px]"
            >
              {PROJECT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase().replace("_", " ")}
                </option>
              ))}
            </NativeSelect>
            <Button size="sm" onClick={() => openQuickAdd({ projectId })}>
              <Plus /> Task
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete project"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
              <span className="tabular-nums">
                {done.length} of {items.length} tasks complete
              </span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <Progress value={percent} />
          </div>
          <div className="flex items-center gap-1.5">
            {project.memberIds.slice(0, 6).map((id) => {
              const member = members.find((m) => m.id === id);
              return <Avatar key={id} name={member?.name ?? "Member"} src={member?.avatar} size="sm" />;
            })}
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="active">Active work</TabsTrigger>
          <TabsTrigger value="backlog">Backlog</TabsTrigger>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Upcoming" icon={<CalendarRange />}>
            {upcoming.length === 0 ? (
              <p className="px-1 py-3 text-[12px] text-muted-foreground">Nothing scheduled ahead.</p>
            ) : (
              <ul className="space-y-1.5">
                {upcoming.map((item) => (
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
          </Section>

          <Section title="Overdue" icon={<AlertTriangle className="text-destructive" />}>
            {overdue.length === 0 ? (
              <p className="px-1 py-3 text-[12px] text-muted-foreground">Nothing overdue.</p>
            ) : (
              <ul className="space-y-1.5">
                {overdue.map((item) => (
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
          </Section>

          <Section title="Recent activity" icon={<ListTodo />}>
            {activity.length === 0 ? (
              <p className="px-1 py-3 text-[12px] text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ol className="space-y-2">
                {activity.slice(0, 10).map((row) => {
                  const actor = actors.find((a) => a.id === row.actorId);
                  return (
                    <li key={row.id} className="flex items-start gap-2">
                      <Avatar name={actor?.name ?? "Someone"} src={actor?.avatar} size="xs" />
                      <p className="min-w-0 flex-1 text-[12px] leading-snug">
                        <span className="font-medium">{actor?.name ?? "Someone"}</span>{" "}
                        <span className="text-muted-foreground">{row.summary}</span>
                        <span className="block text-[10.5px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>
      ) : tab === "roadmap" ? (
        <div className="space-y-4">
          <div className="fd-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold">
                <Flag className="size-4" /> Milestones
              </h2>
              <MilestonePopover onAdd={addMilestone} />
            </div>
            {project.milestones.length === 0 ? (
              <p className="mt-3 text-[12px] text-muted-foreground">
                No milestones yet. Add a few checkpoints to shape the roadmap.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {project.milestones.map((milestone) => (
                  <li key={milestone._id} className="flex items-center gap-2.5 py-2">
                    <Flag
                      className={`size-3.5 shrink-0 ${milestone.completedAt ? "text-success" : "text-muted-foreground"}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{milestone.title}</span>
                    {milestone.targetDate ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {formatInTimeZone(new Date(milestone.targetDate), timeZone, "d MMM yyyy")}
                      </span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${milestone.title}`}
                      onClick={() => void removeMilestone(milestone._id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <RoadmapTimeline
            items={items}
            milestones={project.milestones}
            timeZone={timeZone}
            color={project.color}
            onSelect={setSelectedId}
          />
        </div>
      ) : (
        <TaskGroup
          items={tab === "backlog" ? backlog : activeWork}
          timeZone={timeZone}
          emptyText={
            tab === "backlog"
              ? "Nothing in the backlog. Unscheduled tasks land here."
              : "No active work. Schedule something or move a task to in progress."
          }
          onSelect={setSelectedId}
          onToggle={toggleStatus}
        />
      )}

      <TaskDetailPanel itemId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void reload()} />

      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectId={projectId}
        projectName={project.name}
      />
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="fd-panel flex flex-col">
      <header className="border-b border-border px-3.5 py-2.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold [&_svg]:size-4">
          {icon}
          {title}
        </h2>
      </header>
      <div className="flex-1 p-3">{children}</div>
    </section>
  );
}

function TaskGroup({
  items,
  timeZone,
  emptyText,
  onSelect,
  onToggle,
}: {
  items: CalendarItem[];
  timeZone: string;
  emptyText: string;
  onSelect: (id: string) => void;
  onToggle: (item: CalendarItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="fd-panel">
        <EmptyState icon={<ListTodo />} title="Nothing here yet" description={emptyText} />
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id}>
          <TaskBlock
            item={item}
            variant="row"
            timeZone={timeZone}
            onClick={() => onSelect(item.id)}
            onToggleStatus={() => onToggle(item)}
          />
        </li>
      ))}
    </ul>
  );
}

function MilestonePopover({ onAdd }: { onAdd: (title: string, targetDate: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus /> Milestone
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-2.5">
        <div className="space-y-1.5">
          <Label htmlFor="milestone-title">Title</Label>
          <Input
            id="milestone-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Beta release"
            className="h-8 text-[12px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="milestone-date">Target date</Label>
          <Input
            id="milestone-date"
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            className="h-8 text-[12px]"
          />
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!title.trim()}
          onClick={() => {
            void onAdd(title.trim(), targetDate);
            setTitle("");
            setTargetDate("");
            setOpen(false);
          }}
        >
          Add milestone
        </Button>
      </PopoverContent>
    </Popover>
  );
}
