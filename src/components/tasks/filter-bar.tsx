"use client";

import * as React from "react";
import { Filter, X } from "lucide-react";
import { useApp, type TaskFilters } from "@/lib/client/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import {
  CONTENT_STATUSES,
  PLATFORMS,
  PRIORITIES,
  TASK_STATUSES,
  type ContentStatus,
  type Platform,
  type Priority,
  type TaskStatus,
} from "@/lib/types";
import { CONTENT_STATUS_META, PLATFORM_META, PRIORITY_META, STATUS_META } from "@/components/tasks/task-meta";

export function countActiveFilters(filters: TaskFilters, showAssigneeFilter = true): number {
  return (
    (filters.projectId?.length ?? 0) +
    (filters.status?.length ?? 0) +
    (filters.priority?.length ?? 0) +
    (filters.tagId?.length ?? 0) +
    (filters.platform?.length ?? 0) +
    (filters.contentStatus?.length ?? 0) +
    (showAssigneeFilter && filters.assigneeId ? 1 : 0)
  );
}

/** Combinable filters. Every list and calendar view shares this control. */
export function FilterBar({
  filters,
  onChange,
  showContentFilters = false,
  showAssigneeFilter = true,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  showContentFilters?: boolean;
  showAssigneeFilter?: boolean;
}) {
  const { projects, tags, members, user } = useApp();
  const active = countActiveFilters(filters, showAssigneeFilter);

  const toggle = <K extends keyof TaskFilters>(key: K, value: string): void => {
    const current = (filters[key] as string[] | undefined) ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...filters, [key]: next.length > 0 ? next : undefined });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            <Filter /> Filter
            {active > 0 ? (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {active}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 w-56 overflow-y-auto fd-scroll-thin">
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {TASK_STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filters.status?.includes(status) ?? false}
              onCheckedChange={() => toggle("status", status)}
              onSelect={(event) => event.preventDefault()}
            >
              {STATUS_META[status as TaskStatus].label}
            </DropdownMenuCheckboxItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          {PRIORITIES.map((priority) => (
            <DropdownMenuCheckboxItem
              key={priority}
              checked={filters.priority?.includes(priority) ?? false}
              onCheckedChange={() => toggle("priority", priority)}
              onSelect={(event) => event.preventDefault()}
            >
              {PRIORITY_META[priority as Priority].label}
            </DropdownMenuCheckboxItem>
          ))}

          {projects.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Project</DropdownMenuLabel>
              {projects.map((project) => (
                <DropdownMenuCheckboxItem
                  key={project.id}
                  checked={filters.projectId?.includes(project.id) ?? false}
                  onCheckedChange={() => toggle("projectId", project.id)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {project.name}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          ) : null}

          {tags.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Tags</DropdownMenuLabel>
              {tags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag.id}
                  checked={filters.tagId?.includes(tag.id) ?? false}
                  onCheckedChange={() => toggle("tagId", tag.id)}
                  onSelect={(event) => event.preventDefault()}
                >
                  #{tag.name}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          ) : null}

          {showAssigneeFilter && members.length > 1 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Assignee</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={filters.assigneeId === "me"}
                onCheckedChange={() =>
                  onChange({ ...filters, assigneeId: filters.assigneeId === "me" ? undefined : "me" })
                }
                onSelect={(event) => event.preventDefault()}
              >
                Assigned to me
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.assigneeId === "none"}
                onCheckedChange={() =>
                  onChange({ ...filters, assigneeId: filters.assigneeId === "none" ? undefined : "none" })
                }
                onSelect={(event) => event.preventDefault()}
              >
                Unassigned
              </DropdownMenuCheckboxItem>
              {members
                .filter((member) => member.id !== user.id)
                .map((member) => (
                  <DropdownMenuCheckboxItem
                    key={member.id}
                    checked={filters.assigneeId === member.id}
                    onCheckedChange={() =>
                      onChange({
                        ...filters,
                        assigneeId: filters.assigneeId === member.id ? undefined : member.id,
                      })
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {member.name}
                  </DropdownMenuCheckboxItem>
                ))}
            </>
          ) : null}

          {showContentFilters ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Platform</DropdownMenuLabel>
              {PLATFORMS.map((platform) => (
                <DropdownMenuCheckboxItem
                  key={platform}
                  checked={filters.platform?.includes(platform) ?? false}
                  onCheckedChange={() => toggle("platform", platform)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {PLATFORM_META[platform as Platform].label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Content status</DropdownMenuLabel>
              {CONTENT_STATUSES.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={filters.contentStatus?.includes(status) ?? false}
                  onCheckedChange={() => toggle("contentStatus", status)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {CONTENT_STATUS_META[status as ContentStatus].label}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {active > 0 ? (
        <>
          {(filters.status ?? []).map((status) => (
            <Badge key={status} variant="outline">
              {STATUS_META[status].label}
            </Badge>
          ))}
          {(filters.priority ?? []).map((priority) => (
            <Badge key={priority} variant="outline">
              {PRIORITY_META[priority as Priority].label}
            </Badge>
          ))}
          {(filters.projectId ?? []).map((id) => (
            <Badge key={id} variant="outline">
              {projects.find((p) => p.id === id)?.name ?? "Project"}
            </Badge>
          ))}
          {(filters.tagId ?? []).map((id) => (
            <Badge key={id} variant="outline">
              #{tags.find((t) => t.id === id)?.name ?? "tag"}
            </Badge>
          ))}
          {showAssigneeFilter && filters.assigneeId ? (
            <Badge variant="outline">
              {filters.assigneeId === "me"
                ? "Assigned to me"
                : filters.assigneeId === "none"
                  ? "Unassigned"
                  : (members.find((m) => m.id === filters.assigneeId)?.name ?? "Assignee")}
            </Badge>
          ) : null}
          {showContentFilters
            ? (filters.platform ?? []).map((platform) => (
                <Badge key={platform} variant="outline">
                  {PLATFORM_META[platform as Platform].label}
                </Badge>
              ))
            : null}
          {showContentFilters
            ? (filters.contentStatus ?? []).map((status) => (
                <Badge key={status} variant="outline">
                  {CONTENT_STATUS_META[status as ContentStatus].label}
                </Badge>
              ))
            : null}
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>
            <X /> Clear
          </Button>
        </>
      ) : null}
    </div>
  );
}
