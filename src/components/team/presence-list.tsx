"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { api, qs } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Users } from "lucide-react";

interface PresenceRow {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  online: boolean;
  activeTaskTitle: string | null;
  lastSeenAt: string | null;
}

const POLL_MS = 60_000;

/** Lightweight presence: derived from heartbeats plus the task a person chose
 *  to mark as active. No keystroke or window tracking. */
export function PresenceList({ compact = false }: { compact?: boolean }) {
  const { workspaceId } = useApp();
  const [rows, setRows] = React.useState<PresenceRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const load = (): void => {
      // A hidden tab does not need presence; it refreshes when it comes back.
      if (document.visibilityState !== "visible") return;
      void api
        .get<{ presence: PresenceRow[] }>(`/api/presence${qs({ workspaceId })}`)
        .then((data) => {
          if (!cancelled) setRows(data.presence);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState icon={<Users />} title="No teammates yet" description="Invite people to share plans." />;
  }

  const sorted = [...rows].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  return (
    <ul className={compact ? "space-y-1.5" : "divide-y divide-border"}>
      {sorted.map((row) => (
        <li
          key={row.id}
          className={compact ? "flex items-center gap-2.5" : "flex items-center gap-3 px-1 py-2.5"}
        >
          <Avatar name={row.name} src={row.avatar} size={compact ? "sm" : "md"} online={row.online} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5">
              <span className="truncate text-[13px] font-medium">{row.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">@{row.username}</span>
            </p>
            <p className="truncate text-[12px] text-muted-foreground">
              {row.online ? (
                row.activeTaskTitle ? (
                  <>
                    working on <span className="text-foreground">{row.activeTaskTitle}</span>
                  </>
                ) : (
                  "online"
                )
              ) : row.lastSeenAt ? (
                `last seen ${formatDistanceToNow(new Date(row.lastSeenAt), { addSuffix: true })}`
              ) : (
                "not seen yet"
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
