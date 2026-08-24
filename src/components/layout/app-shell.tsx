"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { NAV_ITEMS, PAGE_TITLES } from "@/components/layout/nav-config";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { QuickAddDialog } from "@/components/tasks/quick-add-dialog";
import { InviteDialog } from "@/components/layout/invite-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { InstallPrompt } from "@/components/layout/install-prompt";
import { OfflineBanner } from "@/components/layout/offline-banner";

const PRESENCE_INTERVAL_MS = 90_000;

interface ShellContextValue {
  openQuickAdd: (defaults?: QuickAddDefaults) => void;
  openPalette: () => void;
  setPageActions: (actions: React.ReactNode) => void;
  setPageTitle: (title: string | null) => void;
}

export interface QuickAddDefaults {
  startAt?: Date;
  projectId?: string;
  isContent?: boolean;
  allDay?: boolean;
}

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const context = React.useContext(ShellContext);
  if (!context) throw new Error("useShell must be used inside AppShell");
  return context;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspaceId } = useApp();

  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [quickAddDefaults, setQuickAddDefaults] = React.useState<QuickAddDefaults>({});
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [pageActions, setPageActions] = React.useState<React.ReactNode>(null);
  const [pageTitle, setPageTitle] = React.useState<string | null>(null);

  const openQuickAdd = React.useCallback((defaults: QuickAddDefaults = {}) => {
    setQuickAddDefaults(defaults);
    setQuickAddOpen(true);
  }, []);

  // Presence heartbeat: only while the tab is visible, so it reflects real use.
  React.useEffect(() => {
    if (!workspaceId) return;
    const beat = (): void => {
      if (document.visibilityState !== "visible") return;
      void api.post("/api/presence", { workspaceId }).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, PRESENCE_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [workspaceId]);

  // Global shortcuts. Ignored while typing so they never eat input.
  React.useEffect(() => {
    let pendingGo = false;
    let goTimer = 0;

    const isTyping = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      if (pendingGo) {
        const targets: Record<string, string> = {
          t: "/",
          c: "/calendar",
          i: "/inbox",
          p: "/projects",
          m: "/tasks",
          a: "/analytics",
        };
        const href = targets[event.key.toLowerCase()];
        pendingGo = false;
        window.clearTimeout(goTimer);
        if (href) {
          event.preventDefault();
          router.push(href);
        }
        return;
      }

      if (event.key.toLowerCase() === "g") {
        pendingGo = true;
        goTimer = window.setTimeout(() => {
          pendingGo = false;
        }, 1200);
        return;
      }
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        openQuickAdd();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(goTimer);
    };
  }, [router, openQuickAdd]);

  React.useEffect(() => {
    setPageActions(null);
    setPageTitle(null);
    setMobileNavOpen(false);
  }, [pathname]);

  const contextValue = React.useMemo<ShellContextValue>(
    () => ({ openQuickAdd, openPalette: () => setPaletteOpen(true), setPageActions, setPageTitle }),
    [openQuickAdd],
  );

  const title = pageTitle ?? PAGE_TITLES[pathname] ?? "Flowdeck";
  const mobileItems = NAV_ITEMS.filter((item) => item.mobile);

  return (
    <ShellContext.Provider value={contextValue}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <div className="hidden w-60 shrink-0 lg:block">
          <Sidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title={title}
            actions={pageActions}
            onOpenPalette={() => setPaletteOpen(true)}
            onQuickAdd={() => openQuickAdd()}
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />
          <OfflineBanner />
          <main className="fd-scroll-thin flex-1 overflow-y-auto pb-16 lg:pb-0">{children}</main>

          <nav
            aria-label="Primary"
            className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {mobileItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-5" />
                  {item.label.split(" ")[0]}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent size="sm" className="left-0 top-0 h-dvh max-w-64 translate-x-0 rounded-none border-y-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </DialogContent>
      </Dialog>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onQuickAdd={() => openQuickAdd()}
        onInvite={() => setInviteOpen(true)}
      />
      <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} defaults={quickAddDefaults} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <InstallPrompt />
    </ShellContext.Provider>
  );
}
