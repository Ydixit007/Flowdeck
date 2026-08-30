"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function DeleteWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { workspace, workspaces, setWorkspaceId, refreshWorkspaces } = useApp();
  const [confirmation, setConfirmation] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!workspace || confirmation !== workspace.name) return;
    setDeleting(true);
    try {
      await api.delete(`/api/workspaces/${workspace.id}`);
      // Switch away before refreshing, so nothing renders against a dead id.
      const next = workspaces.find((w) => w.id !== workspace.id);
      if (next) setWorkspaceId(next.id);
      await refreshWorkspaces();
      onOpenChange(false);
      toast.success("Workspace deleted");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the workspace");
    } finally {
      setDeleting(false);
    }
  };

  const setOpen = (next: boolean): void => {
    if (!next) setConfirmation("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Delete {workspace?.name ?? "workspace"}?</DialogTitle>
            <DialogDescription>
              Every project, task, tag, comment and attachment in this workspace is permanently
              deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <Label htmlFor="workspace-confirm">
              Type <span className="font-semibold text-foreground">{workspace?.name}</span> to confirm
            </Label>
            <Input
              id="workspace-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoFocus
              autoComplete="off"
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              loading={deleting}
              disabled={confirmation !== workspace?.name}
            >
              Delete workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
