"use client";

import * as React from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Copy, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/client/api";
import { ADMIN_ROLES, type AdminRole } from "@/lib/smol-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Select, useSmolFetch } from "@/components/smol/smol-ui";

interface Admin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  lastSeenAt: string | null;
  invitePending: boolean;
  createdAt: string;
}

const ROLE_HINT: Record<AdminRole, string> = {
  superadmin: "Everything, including admin actions, exports and managing admins.",
  marketing: "Read-only seller contact details. No orders, buyers or billing.",
};

/** Superadmin-only: invite admins, change roles, remove access. Changes sign the admin out at once. */
export function AdminsView() {
  const { data, error, reload } = useSmolFetch<Admin[]>("/api/admins");
  const [inviting, setInviting] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<Admin | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const changeRole = async (admin: Admin, role: AdminRole) => {
    setBusy(admin.id);
    try {
      await api.patch(`/api/admins/${admin.id}`, { role });
      toast.success(`${admin.name} is now ${role}`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change role");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    try {
      await api.delete(`/api/admins/${removing.id}`);
      toast.success(`${removing.name} no longer has access`);
      setRemoving(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove admin");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Admins</h2>
          <p className="text-[12px] text-muted-foreground">Who can open this panel. Role changes and removals sign that person out straight away.</p>
        </div>
        <Button size="sm" onClick={() => setInviting(true)}>
          <UserPlus /> Invite admin
        </Button>
      </div>

      {error ? (
        <EmptyState icon={<ShieldCheck />} title="Could not load admins" description={error} />
      ) : !data ? (
        <Skeleton className="h-48" />
      ) : (
        <section className="fd-panel fd-scroll-thin overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr className="border-b border-border bg-surface-sunken/60">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Last seen</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-4 py-2 font-medium">{admin.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{admin.email}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={admin.role}
                      disabled={busy === admin.id}
                      onChange={(event) => void changeRole(admin, event.target.value as AdminRole)}
                      aria-label={`Role for ${admin.name}`}
                    >
                      {ADMIN_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {admin.invitePending ? (
                      <Badge variant="warning">invite pending</Badge>
                    ) : admin.lastSeenAt ? (
                      formatDistanceToNow(new Date(admin.lastSeenAt), { addSuffix: true })
                    ) : (
                      "never"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(admin)} aria-label={`Remove ${admin.name}`} title="Remove access">
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onInvited={(inviteLink) => {
          setInviting(false);
          setLink(inviteLink);
          reload();
        }}
      />

      <Dialog open={!!link} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this invite link</DialogTitle>
            <DialogDescription>No email is sent. Share the link yourself; it lets them set a password and works for 7 days.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex gap-2">
            <Input readOnly value={link ?? ""} onFocus={(event) => event.target.select()} className="font-mono text-[12px]" />
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(link ?? "").then(() => toast.success("Link copied"))}>
              <Copy /> Copy
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(open) => !open && busy === null && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>They are signed out everywhere and can no longer open the panel. You can invite them again later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()} loading={busy !== null}>
              Remove access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (link: string) => void }) {
  const [role, setRole] = React.useState<AdminRole>("marketing");
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const { inviteLink } = await api.post<{ inviteLink: string }>("/api/admins", { name: form.get("name"), email: form.get("email"), role });
      onInvited(`${window.location.origin}${inviteLink}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not invite");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Invite admin</DialogTitle>
            <DialogDescription>You get a link to send them. They set their own password.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Name</Label>
              <Input id="invite-name" name="name" required maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
                {ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <p className="text-[12px] text-muted-foreground">{ROLE_HINT[role]}</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
