"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Menu, Plus, Search, Settings, User as UserIcon } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function Topbar({
  title,
  actions,
  onOpenPalette,
  onQuickAdd,
  onOpenMobileNav,
}: {
  title: string;
  actions?: React.ReactNode;
  onOpenPalette: () => void;
  onQuickAdd: () => void;
  onOpenMobileNav: () => void;
}) {
  const router = useRouter();
  const { user } = useApp();

  const signOut = async (): Promise<void> => {
    try {
      await api.post("/api/auth/logout");
      router.push("/login");
    } catch {
      toast.error("Could not sign out");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">{title}</h1>

      <button
        onClick={onOpenPalette}
        className="hidden h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground md:flex"
      >
        <Search className="size-3.5" />
        <span>Search…</span>
        <kbd className="ml-3 rounded border border-border px-1 py-px font-sans text-[10px]">⌘K</kbd>
      </button>

      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenPalette} aria-label="Search">
        <Search />
      </Button>

      {actions}

      <Button size="sm" onClick={onQuickAdd} className="hidden sm:inline-flex">
        <Plus /> New task
      </Button>
      <Button size="icon" onClick={onQuickAdd} className="sm:hidden" aria-label="New task">
        <Plus />
      </Button>

      <NotificationsMenu />
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
            <Avatar name={user.name} src={user.avatar} size="md" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-2">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">@{user.username}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <UserIcon /> Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings?tab=notifications">
              <Settings /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
