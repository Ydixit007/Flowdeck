"use client";

import * as React from "react";
import { toast } from "sonner";
import { Ban, Eye, LogOut, MoreHorizontal, Pencil, Power, RefreshCw, ShieldOff, SlidersHorizontal, Trash2, Unlink } from "lucide-react";
import { api } from "@/lib/client/api";
import { SMOL_PLAN_ORDER } from "@/lib/smol-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel, Select, badgeVariant, fmtDate, type Row } from "@/components/smol/smol-ui";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { FeatureAccess, OtpLimit } from "@/components/smol/admin-tools";

type Op = { op: "action" | "plan" | "credits" | "edit" | "domain"; [key: string]: unknown };
interface Confirm {
  title: string;
  description: string;
  label: string;
  body: Op;
  done: string;
}

/** Superadmin seller controls (header actions, Admin tab panel, dialogs); every change runs through the backend's admin API. */
export function useSellerControls({ id, doc, onChanged, erase }: { id: string; doc: Row; onChanged: () => void; erase: React.ReactNode }) {
  const credits = (doc.credits ?? {}) as { plan?: string; subscriptionProvider?: string; subscriptionTermEnd?: string };
  const customDomain = (doc.customDomain ?? null) as { hostname?: string; status?: string; error?: string } | null;
  const deletion = (doc.deletion ?? null) as { at?: string; mode?: string; by?: string; releasedPhone?: string } | null;
  const disabled = doc.status === "disabled";
  const blocked = doc.loginBlocked === true;
  const name = String(doc.storeName ?? "this seller");

  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [plan, setPlan] = React.useState(credits.plan ?? "free");
  const [endsAt, setEndsAt] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [mode, setMode] = React.useState<"allow_resignup" | "ban">("allow_resignup");
  const [editing, setEditing] = React.useState(false);
  const [features, setFeatures] = React.useState(false);

  const run = async ({ op, ...body }: Op, done: string) => {
    setBusy(true);
    try {
      await api.post(`/api/smol/admin/stores/${id}/${op}`, body);
      toast.success(done);
      setConfirm(null);
      setDeleting(false);
      setEditing(false);
      onChanged();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (deletion) {
    return {
      actions: null,
      dialogs: null,
      panel: (
      <Panel title="Deleted" description={`Soft-deleted ${fmtDate(deletion.at, "d MMM yyyy")}${deletion.by ? ` by ${deletion.by}` : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
          <p className="text-muted-foreground">
            {deletion.mode === "ban"
              ? `Number ${String(doc.phone)} is banned from signing up again.`
              : `Number ${deletion.releasedPhone ?? "?"} was released and can sign up again.`}{" "}
            All data is kept.
          </p>
          {erase}
        </div>
      </Panel>
      ),
    };
  }

  // Opened before the request so the popup isn't blocked; the token travels in the URL fragment only.
  const viewAs = async () => {
    const tab = window.open("about:blank", "_blank");
    try {
      const { url } = await api.post<{ url: string }>(`/api/smol/admin/stores/${id}/view`, {});
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      }
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : "Could not open the dashboard");
    }
  };

  const credit = Number(amount);
  const creditValid = Number.isInteger(credit) && credit !== 0;

  const confirmLogout = () =>
    setConfirm({ title: `Log ${name} out everywhere?`, description: "Every session ends now. They can sign in again with an OTP.", label: "Log out", body: { op: "action", action: "logout" }, done: "Seller logged out everywhere" });
  const confirmBlock = () =>
    setConfirm(
      blocked
        ? { title: `Unblock ${name}?`, description: "They can request an OTP and sign in again.", label: "Unblock", body: { op: "action", action: "unblock" }, done: "Login unblocked" }
        : {
            title: `Block ${name} from signing in?`,
            description: "No OTP is sent and every session ends until you unblock them. The storefront keeps running.",
            label: "Block",
            body: { op: "action", action: "block" },
            done: "Login blocked",
          },
    );
  const confirmStatus = () =>
    setConfirm(
      disabled
        ? { title: `Enable ${name}?`, description: "The storefront comes back and checkout reopens.", label: "Enable", body: { op: "action", action: "enable" }, done: `${name} enabled` }
        : {
            title: `Disable ${name}?`,
            description: "The storefront shows \"store unavailable\" and checkout is refused. Data is kept and the seller can still sign in.",
            label: "Disable",
            body: { op: "action", action: "disable" },
            done: `${name} disabled`,
          },
    );

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled={busy || blocked} onClick={() => void viewAs()} title={blocked ? "Unblock login first" : "Read-only, 15 minutes, opens in a new tab"}>
        <Eye /> View as seller
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
        <Pencil /> Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="secondary" disabled={busy} aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setFeatures(true)}>
            <SlidersHorizontal /> Feature access
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={confirmLogout}>
            <LogOut /> Force logout
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={confirmBlock}>
            {blocked ? <ShieldOff /> : <Ban />} {blocked ? "Unblock login" : "Block login"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={confirmStatus}>
            <Power /> {disabled ? "Enable store" : "Disable store"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setDeleting(true)}>
            <Trash2 /> Delete seller
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const panel = (
    <Panel title="Admin controls" description="Changes apply at once and are recorded in the admin log.">
      <div className="divide-y divide-border text-[13px]">
        <div className="grid gap-5 p-4 md:grid-cols-2">
          <Section
            title="Plan"
            hint={
              credits.subscriptionProvider === "admin"
                ? `Set by an admin${credits.subscriptionTermEnd ? `, ends ${fmtDate(credits.subscriptionTermEnd, "d MMM yyyy")}` : ", no end date"}.`
                : "Grants the plan's monthly credits now; no charge."
            }
          >
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run({ op: "plan", plan, endsAt: endsAt ? new Date(`${endsAt}T23:59:59.999+05:30`).toISOString() : null }, `Plan set to ${plan}`);
              }}
            >
              <Select value={plan} onChange={(event) => setPlan(event.target.value)} aria-label="Plan">
                {SMOL_PLAN_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </Select>
              {plan !== "free" ? (
                <Label className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
                  until
                  <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="h-8 w-36" aria-label="Plan end date (optional)" />
                </Label>
              ) : null}
              <Button size="sm" type="submit" disabled={busy}>
                Apply
              </Button>
            </form>
          </Section>

          <Section title="Credits" hint="Added credits never expire. The balance can't go below 0.">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run({ op: "credits", amount: credit, reason: reason.trim() || undefined }, `${credit > 0 ? "Added" : "Removed"} ${Math.abs(credit)} credits`).then(
                  (ok) => ok && (setAmount(""), setReason("")),
                );
              }}
            >
              <Input type="number" step={1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="+500 or -200" className="h-8 w-28" aria-label="Credits to add or remove" />
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (optional)" maxLength={200} className="h-8 w-auto min-w-32 flex-1" aria-label="Reason" />
              <Button size="sm" type="submit" disabled={busy || !creditValid}>
                Apply
              </Button>
            </form>
          </Section>
        </div>

        <div className="grid gap-5 p-4 md:grid-cols-2">
          <Section title="Feature access" hint="Grant features above the seller's plan.">
            <Button size="sm" variant="secondary" onClick={() => setFeatures(true)}>
              <SlidersHorizontal /> Manage features
            </Button>
          </Section>
          <Section title="OTP limit">
            <OtpLimit phone={String(doc.phone ?? "")} />
          </Section>
          {customDomain?.hostname ? (
            <Section title="Custom domain" hint={customDomain.error}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{customDomain.hostname}</span>
                <Badge variant={badgeVariant(String(customDomain.status))}>{String(customDomain.status)}</Badge>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ op: "domain", action: "recheck" }, "Domain re-checked")}>
                  <RefreshCw /> Re-check
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: `Remove ${customDomain.hostname}?`,
                      description: "The custom domain stops serving the store at once and the seller has to connect it again. The subdomain keeps working.",
                      label: "Remove domain",
                      body: { op: "domain", action: "remove" },
                      done: "Custom domain removed",
                    })
                  }
                >
                  <Unlink /> Remove
                </Button>
              </div>
            </Section>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="mr-auto min-w-0">
            <p className="font-medium text-destructive">Danger zone</p>
            <p className="text-[12px] text-muted-foreground">Logout, block and delete end the seller&apos;s sessions on every device.</p>
          </div>
          <Button size="sm" variant="secondary" disabled={busy} onClick={confirmStatus}>
            <Power /> {disabled ? "Enable store" : "Disable store"}
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => setDeleting(true)}>
            <Trash2 /> Delete seller
          </Button>
          {erase}
        </div>
      </div>

    </Panel>
  );

  const dialogs = (
    <>
      <Dialog open={!!confirm} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => confirm && void run(confirm.body, confirm.done)} loading={busy}>
              {confirm?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={features} onOpenChange={setFeatures}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Feature access</DialogTitle>
            <DialogDescription>Grants sit on top of {name}&apos;s plan and apply at once. Features the plan includes are locked on.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FeatureAccess id={id} />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <EditDetails open={editing} doc={doc} busy={busy} onClose={() => setEditing(false)} onSave={(body) => void run({ op: "edit", ...body }, "Details saved")} />

      <Dialog open={deleting} onOpenChange={(open) => !busy && setDeleting(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              The store disappears for the seller and buyers and every session ends. All data is kept, and a gateway subscription is cancelled. Use Erase all data for a real removal request.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2 text-[13px]" role="radiogroup" aria-label="Phone number">
            {(
              [
                ["allow_resignup", "Allow re-signup", "The phone number can create a new store."],
                ["ban", "Ban", "The phone number can never sign up or sign in again."],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 has-[:checked]:border-primary">
                <input type="radio" name="delete-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5" />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-[12px] text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void run({ op: "action", action: "delete", mode }, `${name} deleted`)} loading={busy}>
              Delete seller
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { actions, panel, dialogs };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const DETAIL_FIELDS = [
  ["storeName", "Store name", "text"],
  ["domain", "Subdomain", "text"],
  ["phone", "Phone (login)", "tel"],
  ["email", "Email", "email"],
] as const;

/** Phone, email, store name and subdomain (SMOL-413); only changed fields are sent. */
function EditDetails({ open, doc, busy, onClose, onSave }: { open: boolean; doc: Row; busy: boolean; onClose: () => void; onSave: (body: Record<string, string>) => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const changed = Object.fromEntries(
              DETAIL_FIELDS.map(([key]): [string, string] => [key, String(form.get(key) ?? "").trim()]).filter(([key, value]) => value && value !== String(doc[key] ?? "")),
            );
            const reason = String(form.get("reason") ?? "").trim();
            onSave({ ...changed, ...(reason ? { reason } : {}) });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
            <DialogDescription>A new phone number logs the seller out everywhere. The old subdomain keeps redirecting buyers.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-3 text-[13px]">
            {DETAIL_FIELDS.map(([key, label, type]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`edit-${key}`}>{label}</Label>
                <Input id={`edit-${key}`} name={key} type={type} defaultValue={String(doc[key] ?? "")} required />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="edit-reason">Reason (optional)</Label>
              <Input id="edit-reason" name="reason" maxLength={300} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
