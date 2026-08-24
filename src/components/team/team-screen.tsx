"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Activity as ActivityIcon, UserPlus, Users, X } from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InviteDialog } from "@/components/layout/invite-dialog";
import { PresenceList } from "@/components/team/presence-list";
import { WORKSPACE_ROLES } from "@/lib/types";
import type { UserRef } from "@/server/users";

interface ActivityRow {
  id: string;
  summary: string;
  actorId: string;
  createdAt: string;
}

export function TeamScreen() {
  const { workspaceId, workspace, members, user, refreshMembers } = useApp();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [activity, setActivity] = React.useState<ActivityRow[]>([]);
  const [actors, setActors] = React.useState<UserRef[]>([]);
  const [loadingActivity, setLoadingActivity] = React.useState(true);

  const isAdmin = workspace?.role === "OWNER" || workspace?.role === "ADMIN";

  React.useEffect(() => {
    if (!workspaceId) return;
    setLoadingActivity(true);
    void api
      .get<{ activity: ActivityRow[]; actors: UserRef[] }>(`/api/activity${qs({ workspaceId, limit: 40 })}`)
      .then((data) => {
        setActivity(data.activity);
        setActors(data.actors);
      })
      .catch(() => undefined)
      .finally(() => setLoadingActivity(false));
  }, [workspaceId]);

  const changeRole = async (userId: string, role: string): Promise<void> => {
    try {
      await api.patch(`/api/workspaces/${workspaceId}/members`, { userId, role });
      await refreshMembers();
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the role");
    }
  };

  const remove = async (userId: string): Promise<void> => {
    try {
      await api.delete(`/api/workspaces/${workspaceId}/members?userId=${userId}`);
      await refreshMembers();
      setRemoving(null);
      toast.success("Member removed — their tasks were unassigned, not deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the member");
    }
  };

  const target = members.find((member) => member.id === removing);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 p-3 sm:p-5 lg:grid-cols-[1.15fr_1fr]">
      <div className="space-y-5">
        <section className="fd-panel">
          <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              <Users className="size-4" /> Members
              <span className="text-[12px] font-normal tabular-nums text-muted-foreground">{members.length}</span>
            </h2>
            {isAdmin ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus /> Invite
              </Button>
            ) : null}
          </header>

          {members.length === 0 ? (
            <EmptyState icon={<Users />} title="Just you so far" description="Invite teammates to share plans." />
          ) : (
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={member.name} src={member.avatar} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13px] font-medium">{member.name}</span>
                      {member.id === user.id ? <Badge>you</Badge> : null}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">@{member.username}</p>
                  </div>

                  {isAdmin && member.id !== workspace?.ownerId ? (
                    <NativeSelect
                      aria-label={`Role for ${member.name}`}
                      value={member.role}
                      onChange={(event) => void changeRole(member.id, event.target.value)}
                      className="h-8 w-28 text-[12px]"
                    >
                      {WORKSPACE_ROLES.filter((role) => role !== "OWNER").map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0) + role.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Badge variant="outline">{member.role.toLowerCase()}</Badge>
                  )}

                  {isAdmin && member.id !== workspace?.ownerId ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => setRemoving(member.id)}
                    >
                      <X />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fd-panel">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Working on right now</h2>
          </header>
          <div className="px-4 py-1">
            <PresenceList />
          </div>
        </section>
      </div>

      <section className="fd-panel self-start">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <ActivityIcon className="size-4" /> Activity
          </h2>
        </header>
        {loadingActivity ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <EmptyState
            icon={<ActivityIcon />}
            title="No activity yet"
            description="Task changes, comments and assignments will appear here."
          />
        ) : (
          <ol className="divide-y divide-border">
            {activity.map((row) => {
              const actor = actors.find((a) => a.id === row.actorId) ?? members.find((m) => m.id === row.actorId);
              return (
                <li key={row.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Avatar name={actor?.name ?? "Someone"} src={actor?.avatar} size="sm" />
                  <p className="min-w-0 flex-1 text-[13px] leading-snug">
                    <span className="font-medium">{actor?.name ?? "Someone"}</span>{" "}
                    <span className="text-muted-foreground">{row.summary}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                    </span>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <Dialog open={Boolean(removing)} onOpenChange={(next) => (next ? undefined : setRemoving(null))}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove {target?.name ?? "this member"}?</DialogTitle>
            <DialogDescription>
              They lose access to this workspace. Their tasks stay, but become unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => removing && void remove(removing)}>
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
