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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeleteProjectDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const { refreshProjects, invalidateTasks } = useApp();
  const [confirmation, setConfirmation] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (confirmation !== projectName) return;
    setDeleting(true);
    try {
      await api.delete(`/api/projects/${projectId}`);
      await refreshProjects();
      invalidateTasks();
      onOpenChange(false);
      toast.success("Project deleted");
      router.push("/projects");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the project");
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
            <DialogTitle>Delete {projectName}?</DialogTitle>
            <DialogDescription>
              The project and its milestones are permanently deleted. Its tasks are kept and
              return to the workspace backlog.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <Label htmlFor="project-confirm">
              Type <span className="font-semibold text-foreground">{projectName}</span> to confirm
            </Label>
            <Input
              id="project-confirm"
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
            <Button type="submit" variant="destructive" loading={deleting} disabled={confirmation !== projectName}>
              Delete project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
