"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/client/store";
import { NAV_ITEMS } from "@/components/layout/nav-config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { ProjectIcon } from "@/components/layout/project-icon";
import { CreateWorkspaceDialog } from "@/components/layout/create-workspace-dialog";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { workspaces, workspace, workspaceId, setWorkspaceId, projects } = useApp();
  const [creatingWorkspace, setCreatingWorkspace] = React.useState(false);

  const activeProjects = projects.filter((p) => p.status !== "ARCHIVED");

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-surface-sunken">
      <div className="flex h-14 items-center gap-2 px-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-1 py-1 transition-opacity hover:opacity-80"
        >
          <span className="flex size-7 items-center justify-center rounded-[7px] bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Flowdeck</span>
        </Link>
      </div>

      <div className="px-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-left text-[13px] transition-colors hover:border-border-strong"
              aria-label="Switch workspace"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: workspace?.color ?? "#6366f1" }}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{workspace?.name ?? "Workspace"}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onSelect={() => setWorkspaceId(w.id)}>
                <span className="size-2 rounded-full" style={{ background: w.color }} />
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === workspaceId ? <Check className="size-3.5" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCreatingWorkspace(true)}>
              <Plus />
              New workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="fd-scroll-thin flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                    active
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "")} />
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <div className="flex items-center justify-between px-2.5 pb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Projects
            </span>
            <Button asChild variant="ghost" size="icon-sm" aria-label="New project">
              <Link href="/projects?new=1" onClick={onNavigate}>
                <Plus />
              </Link>
            </Button>
          </div>
          {activeProjects.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] leading-relaxed text-muted-foreground">
              No projects yet. Group related work to see progress at a glance.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {activeProjects.map((project) => {
                const active = pathname === `/projects/${project.id}`;
                return (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                        active
                          ? "bg-surface font-medium text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <ProjectIcon name={project.icon} color={project.color} className="size-3.5" />
                      <span className="flex-1 truncate">{project.name}</span>
                      {project.taskCount > 0 ? (
                        <span className="text-[11px] tabular-nums text-muted-foreground/70">
                          {project.doneCount}/{project.taskCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>

      <CreateWorkspaceDialog open={creatingWorkspace} onOpenChange={setCreatingWorkspace} />
    </aside>
  );
}
