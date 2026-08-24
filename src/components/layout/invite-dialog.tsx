"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaceId, refreshMembers } = useApp();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("MEMBER");
  const [saving, setSaving] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setInviteLink(null);
    try {
      const result = await api.post<{ added?: boolean; link?: string }>(
        `/api/workspaces/${workspaceId}/invites`,
        { email: email.trim().toLowerCase(), role },
      );
      if (result.added) {
        toast.success("Member added to the workspace");
        setEmail("");
        await refreshMembers();
        onOpenChange(false);
      } else if (result.link) {
        setInviteLink(`${window.location.origin}${result.link}`);
        toast.success("Invite created — share the link");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send invite");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Invite to workspace</DialogTitle>
            <DialogDescription>
              Existing Flowdeck users join immediately. Everyone else gets a link.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <NativeSelect id="invite-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="ADMIN">Admin — manage members and projects</option>
                <option value="MEMBER">Member — create and edit work</option>
                <option value="VIEWER">Viewer — read only</option>
              </NativeSelect>
            </div>

            {inviteLink ? (
              <div className="space-y-1.5 rounded-md border border-border bg-surface-sunken p-2.5">
                <p className="text-[12px] font-medium">Invite link</p>
                <div className="flex gap-1.5">
                  <Input readOnly value={inviteLink} className="h-8 text-[11px]" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    aria-label="Copy invite link"
                    onClick={() => {
                      void navigator.clipboard.writeText(inviteLink);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" loading={saving}>
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
