"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { FolderKanban, Plus } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { PROJECT_STATUSES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Progress } from "@/components/ui/misc";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectIcon, PROJECT_ICON_NAMES, PROJECT_COLORS } from "@/components/layout/project-icon";


export function ProjectsScreen() {
  const { projects, user } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [creating, setCreating] = React.useState(params.get("new") === "1");

  const grouped = PROJECT_STATUSES.map((status) => ({
    status,
    items: projects.filter((project) => project.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-3 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          {projects.length === 0
            ? "Group related work to see progress, milestones and a roadmap."
            : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="fd-panel">
          <EmptyState
            icon={<FolderKanban />}
            title="No projects yet"
            description="Projects hold tasks, milestones and a timeline — useful once work spans more than a day."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> Create a project
              </Button>
            }
          />
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.status} className="space-y-2">
            <h2 className="flex items-baseline gap-2 px-1">
              <span className="text-[13px] font-semibold">
                {group.status.charAt(0) + group.status.slice(1).toLowerCase().replace("_", " ")}
              </span>
              <span className="text-[12px] tabular-nums text-muted-foreground">{group.items.length}</span>
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((project) => {
                const percent = project.taskCount > 0 ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
                return (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="fd-panel block h-full p-3.5 transition-colors hover:border-border-strong"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `${project.color}1a` }}
                        >
                          <ProjectIcon name={project.icon} color={project.color} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold">{project.name}</p>
                          {project.description ? (
                            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                              {project.description}
                            </p>
                          ) : null}
                        </div>
                        {project.overdueCount > 0 ? (
                          <Badge variant="danger">{project.overdueCount} late</Badge>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                          <span className="tabular-nums">
                            {project.doneCount}/{project.taskCount} tasks
                          </span>
                          <span className="tabular-nums">{percent}%</span>
                        </div>
                        <Progress value={percent} />
                      </div>

                      {project.targetDate ? (
                        <p className="mt-2.5 text-[11px] text-muted-foreground">
                          Target {formatInTimeZone(new Date(project.targetDate), user.timezone, "d MMM yyyy")}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <CreateProjectDialog
        open={creating}
        onOpenChange={(next) => {
          setCreating(next);
          if (!next && params.get("new")) router.replace("/projects");
        }}
      />
    </div>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { workspaceId, refreshProjects } = useApp();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [icon, setIcon] = React.useState("Folder");
  const [color, setColor] = React.useState(PROJECT_COLORS[0] as string);
  const [status, setStatus] = React.useState("ACTIVE");
  const [targetDate, setTargetDate] = React.useState("");
  const [isContentProject, setIsContentProject] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await api.post<{ project: { _id: string } }>("/api/projects", {
        workspaceId,
        name: name.trim(),
        description: description || null,
        icon,
        color,
        status,
        targetDate: targetDate ? new Date(`${targetDate}T12:00:00Z`).toISOString() : null,
        isContentProject,
      });
      await refreshProjects();
      toast.success("Project created");
      onOpenChange(false);
      setName("");
      setDescription("");
      router.push(`/projects/${created.project._id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Group related tasks and track them to a target date.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Flowdeck"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this project for?"
                className="min-h-16"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1">
                {PROJECT_ICON_NAMES.map((name_) => (
                  <button
                    key={name_}
                    type="button"
                    onClick={() => setIcon(name_)}
                    aria-pressed={icon === name_}
                    aria-label={name_}
                    className={`flex size-8 items-center justify-center rounded-md border transition-colors ${
                      icon === name_ ? "border-primary bg-accent" : "border-border hover:bg-muted"
                    }`}
                  >
                    <ProjectIcon name={name_} color={color} />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setColor(value)}
                    aria-pressed={color === value}
                    aria-label={`Colour ${value}`}
                    className={`size-6 rounded-full border-2 transition-transform ${
                      color === value ? "scale-110 border-foreground" : "border-transparent"
                    }`}
                    style={{ background: value }}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="project-status">Status</Label>
                <NativeSelect
                  id="project-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {PROJECT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value.charAt(0) + value.slice(1).toLowerCase().replace("_", " ")}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-target">Target date</Label>
                <Input
                  id="project-target"
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={isContentProject}
                onChange={(event) => setIsContentProject(event.target.checked)}
                className="size-3.5 accent-[var(--primary)]"
              />
              This is a content project
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
