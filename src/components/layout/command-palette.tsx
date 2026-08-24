"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import {
  CalendarDays,
  CheckSquare,
  FolderKanban,
  Hash,
  Megaphone,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  UserPlus,
  Users,
} from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { NAV_ITEMS } from "@/components/layout/nav-config";
import type { SearchHit } from "@/app/api/search/route";

const HIT_ICONS: Record<SearchHit["type"], React.ReactNode> = {
  task: <CheckSquare />,
  content: <Megaphone />,
  project: <FolderKanban />,
  user: <Users />,
  tag: <Hash />,
  comment: <MessageSquare />,
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuickAdd: () => void;
  onInvite: () => void;
}

export function CommandPalette({ open, onOpenChange, onQuickAdd, onInvite }: CommandPaletteProps) {
  const router = useRouter();
  const { workspaceId } = useApp();
  const { setTheme, resolvedTheme } = useTheme();
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Debounced server search; the palette stays usable while results load.
  React.useEffect(() => {
    if (!open || query.trim().length < 2 || !workspaceId) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      void api
        .get<{ hits: SearchHit[] }>(`/api/search${qs({ workspaceId, q: query.trim() })}`)
        .then((data) => setHits(data.hits))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [open, query, workspaceId]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const run = (action: () => void): void => {
    onOpenChange(false);
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      shouldFilter={query.trim().length < 2}
      className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface-raised fd-elevated"
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      contentClassName="outline-none"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-3.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search or jump to…"
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
          ESC
        </kbd>
      </div>

      <Command.List className="fd-scroll-thin max-h-[22rem] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted-foreground">
          {searching ? "Searching…" : "No matches found."}
        </Command.Empty>

        {hits.length > 0 ? (
          <Command.Group heading="Results" className="fd-cmd-group">
            {hits.map((hit) => (
              <Command.Item
                key={`${hit.type}-${hit.id}`}
                value={`${hit.title} ${hit.subtitle ?? ""} ${hit.id}`}
                onSelect={() => run(() => router.push(hit.url))}
                className="fd-cmd-item"
              >
                <span className="[&_svg]:size-4 [&_svg]:text-muted-foreground">{HIT_ICONS[hit.type]}</span>
                <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                {hit.subtitle ? (
                  <span className="shrink-0 text-[11px] capitalize text-muted-foreground">
                    {hit.subtitle.toLowerCase()}
                  </span>
                ) : null}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        <Command.Group heading="Actions" className="fd-cmd-group">
          <Command.Item value="create task new" onSelect={() => run(onQuickAdd)} className="fd-cmd-item">
            <Plus /> Create task
            <span className="ml-auto text-[11px] text-muted-foreground">C</span>
          </Command.Item>
          <Command.Item
            value="create project"
            onSelect={() => run(() => router.push("/projects?new=1"))}
            className="fd-cmd-item"
          >
            <FolderKanban /> Create project
          </Command.Item>
          <Command.Item value="invite member teammate" onSelect={() => run(onInvite)} className="fd-cmd-item">
            <UserPlus /> Invite member
          </Command.Item>
          <Command.Item
            value="toggle dark mode theme"
            onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
            className="fd-cmd-item"
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />} Toggle {resolvedTheme === "dark" ? "light" : "dark"} mode
          </Command.Item>
          <Command.Item
            value="open settings"
            onSelect={() => run(() => router.push("/settings"))}
            className="fd-cmd-item"
          >
            <Settings /> Open settings
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Go to" className="fd-cmd-group">
          {NAV_ITEMS.map((item) => (
            <Command.Item
              key={item.href}
              value={`go to ${item.label}`}
              onSelect={() => run(() => router.push(item.href))}
              className="fd-cmd-item"
            >
              <item.icon /> {item.label}
              {item.shortcut ? (
                <span className="ml-auto text-[11px] tracking-widest text-muted-foreground">{item.shortcut}</span>
              ) : null}
            </Command.Item>
          ))}
          <Command.Item
            value="go to today calendar"
            onSelect={() => run(() => router.push("/calendar?view=day"))}
            className="fd-cmd-item"
          >
            <CalendarDays /> Calendar · Today
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
