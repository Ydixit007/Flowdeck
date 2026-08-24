"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/ui/misc";
import { PushPrompt } from "@/components/layout/push-prompt";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 60_000;

export function NotificationsMenu() {
  const { unreadCount, setUnreadCount } = useApp();
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const data = await api.get<{ notifications: NotificationRow[]; unreadCount: number }>(
        "/api/notifications",
      );
      setRows(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Offline or signed out: leave the last known list in place.
    }
  }, [setUnreadCount]);

  React.useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  React.useEffect(() => {
    if (open) {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }
  }, [open, load]);

  const markAllRead = async (): Promise<void> => {
    setRows((current) => current.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await api.patch("/api/notifications", { all: true });
    } catch {
      void load();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} className="relative">
          {unreadCount > 0 ? <BellRing /> : <Bell />}
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-[13px] font-semibold">Notifications</p>
          {rows.some((row) => !row.readAt) ? (
            <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
              <CheckCheck /> Mark all read
            </Button>
          ) : null}
        </div>

        <PushPrompt />

        <div className="fd-scroll-thin max-h-96 overflow-y-auto">
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="fd-skeleton h-12 rounded-md" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title="You're all caught up"
              description="Reminders, mentions and assignments will show up here."
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.url ?? "#"}
                    onClick={() => setOpen(false)}
                    className="flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${row.readAt ? "bg-transparent" : "bg-primary"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{row.title}</span>
                      {row.body ? (
                        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{row.body}</span>
                      ) : null}
                      <span className="mt-1 block text-[11px] text-muted-foreground/70">
                        {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
