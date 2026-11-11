"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { X } from "lucide-react";
import { api } from "@/lib/client/api";
import { normalizeTag } from "@/lib/smol-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Panel, fmtDate, useSmol } from "@/components/smol/smol-ui";

export interface SellerNotesData {
  tags?: string[];
  notes?: { _id: string; body: string; by: string; at: string; editedAt?: string }[];
}

/** Internal notes and tags (SMOL-417): sellers never see them, marketing reads them, superadmins write. */
export function SellerNotes({ id, initial }: { id: string; initial: SellerNotesData | null | undefined }) {
  const { role, email } = useSmol();
  const canEdit = role === "superadmin";
  const [data, setData] = React.useState<SellerNotesData>(initial ?? {});
  const [draft, setDraft] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; body: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const tags = data.tags ?? [];
  const notes = [...(data.notes ?? [])].reverse();

  const send = async (body: object, done?: string) => {
    setBusy(true);
    try {
      setData((await api.post<SellerNotesData>(`/api/smol/stores/${id}/notes`, body)) ?? {});
      if (done) toast.success(done);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Notes & tags" description="Internal only: the seller never sees these.">
      <div className="space-y-3 px-4 py-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.length === 0 && !canEdit ? <span className="text-muted-foreground">No tags</span> : null}
          {tags.map((t) => (
            <Badge key={t} variant="primary" className="gap-1 pr-1">
              <Link href={`/smol/stores?f=${encodeURIComponent(`tags:${t}`)}`} className="hover:underline">
                {t}
              </Link>
              {canEdit ? (
                <button type="button" disabled={busy} onClick={() => void send({ op: "tags", tags: tags.filter((x) => x !== t) })} aria-label={`Remove tag ${t}`} className="rounded hover:bg-primary/15">
                  <X className="size-3" />
                </button>
              ) : null}
            </Badge>
          ))}
          {canEdit ? (
            <form
              className="inline-flex items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                const next = normalizeTag(tag);
                if (next && !tags.includes(next)) void send({ op: "tags", tags: [...tags, next] }).then((ok) => ok && setTag(""));
              }}
            >
              <Input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Add tag, e.g. vip" maxLength={30} className="h-7 w-32 text-[12px]" aria-label="New tag" />
            </form>
          ) : null}
        </div>

        {canEdit ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send({ op: "add", body: draft }, "Note added").then((ok) => ok && setDraft(""));
            }}
          >
            <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={2000} placeholder="Add an internal note" aria-label="New note" className="min-h-14" />
            {draft.trim() ? (
              <div className="flex justify-end">
                <Button size="sm" type="submit" disabled={busy}>
                  Add note
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}

        {notes.length === 0 ? <p className="text-[12px] text-muted-foreground">No notes yet</p> : null}
        <ul className="divide-y divide-border">
          {notes.map((note) => (
            <li key={note._id} className="space-y-1 py-2">
              <p className="text-[12px] text-muted-foreground">
                {note.by} · {fmtDate(note.at, "d MMM yyyy, HH:mm")}
                {note.editedAt ? " · edited" : ""}
                {canEdit && note.by === email && editing?.id !== note._id ? (
                  <>
                    {" · "}
                    <button type="button" className="hover:text-foreground" onClick={() => setEditing({ id: note._id, body: note.body })}>
                      Edit
                    </button>
                    {" · "}
                    <button type="button" className="hover:text-destructive" disabled={busy} onClick={() => void send({ op: "delete", noteId: note._id }, "Note deleted")}>
                      Delete
                    </button>
                  </>
                ) : null}
              </p>
              {editing?.id === note._id ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send({ op: "edit", noteId: note._id, body: editing.body }, "Note saved").then((ok) => ok && setEditing(null));
                  }}
                >
                  <Textarea value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} rows={2} maxLength={2000} aria-label="Edit note" />
                  <div className="flex gap-2">
                    <Button size="sm" type="submit" disabled={busy || !editing.body.trim()}>
                      Save
                    </Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="whitespace-pre-wrap break-words">{note.body}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
