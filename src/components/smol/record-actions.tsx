"use client";

import * as React from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { api } from "@/lib/client/api";
import { SMOL_ORDER_NEXT, type SmolCollectionName } from "@/lib/smol-config";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnnouncementDialog } from "@/components/smol/collection-view";
import { useSmol, type Row } from "@/components/smol/smol-ui";

/** Superadmin actions on an open record: orders (SMOL-412) and announcements (SMOL-416). */
export function RecordActions({ name, doc, onChanged }: { name: SmolCollectionName; doc: Row; onChanged: () => void }) {
  const { role } = useSmol();
  if (role !== "superadmin") return null;
  if (name === "orders") return <OrderActions doc={doc} onChanged={onChanged} />;
  if (name === "announcements") return <AnnouncementActions doc={doc} onChanged={onChanged} />;
  return null;
}

interface Pending {
  title: string;
  description: string;
  op: "status" | "paid";
  status?: string;
  danger?: boolean;
}

function OrderActions({ doc, onChanged }: { doc: Row; onChanged: () => void }) {
  const status = String(doc.status ?? "pending");
  const cod = (doc.paymentInfo as { method?: string } | undefined)?.method === "cod";
  const unpaid = doc.paymentStatus === "pending";
  const abandoned = status === "pending" && doc.stockReleased === true;
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Unpaid online orders confirm by being marked paid; COD is paid by hand once accepted.
  const canPay = unpaid && (cod ? !["pending", "cancelled", "refunded"].includes(status) : status === "pending");
  const next = (SMOL_ORDER_NEXT[status] ?? []).filter((s) => !(s === "confirmed" && !cod && unpaid));

  const submit = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await api.post(`/api/smol/admin/orders/${doc._id}/${pending.op}`, { status: pending.status, reason: reason.trim() || undefined });
      toast.success(pending.title.replace(/\?$/, ""));
      setPending(null);
      setReason("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setBusy(false);
    }
  };

  if (!canPay && next.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPay ? (
        <Button
          size="sm"
          onClick={() =>
            setPending(
              abandoned
                ? { op: "paid", title: "Convert to a paid order?", description: "Re-reserves the stock (refused if an item is out of stock), marks it paid and confirmed, and tells the seller about a new order." }
                : { op: "paid", title: "Mark as paid?", description: cod ? "Records the cash as collected." : "Confirms the order as paid, for example after checking the UPI proof yourself." },
            )
          }
        >
          {abandoned ? "Convert to paid order" : "Mark paid"}
        </Button>
      ) : null}
      {next.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === "cancelled" ? "destructive" : "secondary"}
          onClick={() =>
            setPending({
              op: "status",
              status: s,
              danger: s === "cancelled",
              title: s === "cancelled" ? "Cancel this order?" : `Move to ${s}?`,
              description: s === "cancelled" ? "Stock goes back and the buyer sees the reason on their tracking page." : "The buyer is notified as if the seller had done it.",
            })
          }
        >
          {s === "cancelled" ? "Cancel order" : `Move to ${s}`}
        </Button>
      ))}

      <Dialog open={!!pending} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            <DialogDescription>{pending?.description}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1 text-[13px]">
            <Label htmlFor="order-reason">Reason (optional)</Label>
            <Textarea id="order-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={300} />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Back
            </Button>
            <Button variant={pending?.danger ? "destructive" : "default"} onClick={() => void submit()} loading={busy}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AnnouncementActions({ doc, onChanged }: { doc: Row; onChanged: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const published = doc.published === true;

  const togglePublished = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/smol/announcements/${doc._id}`, { published: !published });
      toast.success(published ? "Unpublished" : "Published");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
        <Pencil /> Edit
      </Button>
      <Button size="sm" variant="secondary" onClick={() => void togglePublished()} disabled={busy}>
        {published ? <EyeOff /> : <Eye />} {published ? "Unpublish" : "Publish"}
      </Button>
      <AnnouncementDialog open={editing} onClose={() => setEditing(false)} onSaved={onChanged} initial={doc} />
    </div>
  );
}
