"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, AtSign, ExternalLink, Globe, Mail, Phone, Store, Trash2 } from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SMOL_COLLECTIONS, SMOL_LOW_BALANCE, type SmolCollectionName } from "@/lib/smol-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { CollectionView } from "@/components/smol/collection-view";
import { Kpi, Panel, RecordFields, badgeVariant, fmtDate, money, num, useSmolFetch, useUrlState, type Row } from "@/components/smol/smol-ui";

interface Related {
  counts: Record<string, number>;
  paidRevenue: number;
  paidOrders: number;
  lastOrderAt: string | null;
  creditsUsed: number;
  creditsGranted: number;
}
interface Lot {
  _id?: string;
  amount?: number;
  remaining?: number;
  expiresAt?: string | null;
  source?: string;
  planKey?: string;
  packKey?: string;
  grantedAt?: string;
}

const TABS: SmolCollectionName[] = [
  "orders",
  "products",
  "customers",
  "reviews",
  "coupons",
  "credittransactions",
  "billingorders",
  "storelayoutrevisions",
  "featurerequests",
];

/** One seller, everything they own: profile, credit account, then every store-scoped collection. */
export function SellerView({ id }: { id: string }) {
  const url = useUrlState();
  const { data, error } = useSmolFetch<{ doc: Row; related: Related }>(`/api/smol/stores/${id}`);
  const tab = url.get("tab") || "orders";
  const [now] = React.useState(() => Date.now());

  if (error) return <EmptyState icon={<Store />} title="Seller not found" description={error} />;
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:p-5">
        <Skeleton className="h-28" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[92px]" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const { doc, related } = data;
  const credits = (doc.credits ?? {}) as Record<string, unknown> & { lots?: Lot[] };
  const lots = credits.lots ?? [];
  const liveLots = lots.filter((lot) => (lot.remaining ?? 0) > 0 && (!lot.expiresAt || new Date(lot.expiresAt).getTime() > now));
  const liveTotal = liveLots.reduce((sum, lot) => sum + (lot.remaining ?? 0), 0);
  const unlimited = (doc.unlimited ?? {}) as { enabled?: boolean; until?: string };
  const customDomain = (doc.customDomain ?? null) as { hostname?: string; status?: string } | null;
  const instagram = typeof doc.instagram === "string" ? doc.instagram.replace(/^@/, "") : "";
  const balance = Number(credits.balance ?? 0);
  const switchTab = (next: string) =>
    url.set({ tab: next === "orders" ? null : next, q: null, f: null, period: null, from: null, to: null, page: null, sort: null, dir: null, phone: null });

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:p-5">
      <Link href="/smol/stores" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All sellers
      </Link>

      {/* Profile */}
      <section className="fd-panel flex flex-wrap items-start gap-4 p-4">
        {typeof doc.logoUrl === "string" && doc.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote seller logo, arbitrary host
          <img src={doc.logoUrl} alt="" className="size-14 rounded-xl border border-border object-cover" />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Store className="size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">{String(doc.storeName ?? "Unnamed store")}</h2>
            <Badge variant={badgeVariant(String(credits.plan ?? "free"))}>{String(credits.plan ?? "free")}</Badge>
            <Badge variant={badgeVariant(String(doc.status ?? "active"))}>{String(doc.status ?? "active")}</Badge>
            {unlimited.enabled ? <Badge variant="primary">unlimited{unlimited.until ? ` until ${fmtDate(unlimited.until, "d MMM")}` : ""}</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {doc.domain ? (
              <span className="inline-flex items-center gap-1">
                <Globe className="size-3.5" /> {String(doc.domain)}
              </span>
            ) : null}
            {customDomain?.hostname ? (
              <a href={`https://${customDomain.hostname}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                <ExternalLink className="size-3.5" /> {customDomain.hostname}
                <Badge variant={badgeVariant(String(customDomain.status))}>{String(customDomain.status)}</Badge>
              </a>
            ) : null}
            {doc.email ? (
              <a href={`mailto:${String(doc.email)}`} className="inline-flex items-center gap-1 hover:text-primary">
                <Mail className="size-3.5" /> {String(doc.email)}
              </a>
            ) : null}
            {doc.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {doc.countryCode ? `+${String(doc.countryCode)} ` : ""}
                {String(doc.phone)}
              </span>
            ) : null}
            {instagram ? (
              <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                <AtSign className="size-3.5" /> {instagram}
              </a>
            ) : null}
          </div>
          <p className="text-[12px] text-muted-foreground">
            Joined {fmtDate(doc.createdAt, "d MMM yyyy")} · last order{" "}
            {related.lastOrderAt ? formatDistanceToNow(new Date(related.lastOrderAt), { addSuffix: true }) : "never"}
          </p>
        </div>
        <DeleteSeller id={id} domain={String(doc.domain ?? "")} storeName={String(doc.storeName ?? "this seller")} />
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Paid GMV" value={money(related.paidRevenue)} hint={`${num(related.paidOrders)} paid of ${num(related.counts.orders)} orders`} />
        <Kpi label="Avg paid order" value={money(related.paidOrders ? related.paidRevenue / related.paidOrders : 0)} />
        <Kpi label="Customers · Products" value={`${num(related.counts.customers)} · ${num(related.counts.products)}`} hint={`${num(related.counts.reviews)} reviews`} />
        <Kpi
          label="Credit balance"
          value={num(balance)}
          tone={balance <= 0 ? "danger" : balance <= SMOL_LOW_BALANCE ? "warning" : undefined}
          hint={`${num(related.creditsUsed)} used · ${num(related.creditsGranted)} granted all-time`}
        />
      </div>

      {/* Credit account */}
      <Panel
        title="Credit account"
        description={[
          `${String(credits.subscriptionStatus ?? "none")} subscription`,
          credits.billingCycle ? String(credits.billingCycle) : null,
          credits.currentPeriodEnd ? `period ends ${fmtDate(credits.currentPeriodEnd, "d MMM yyyy")}` : null,
          credits.cancelAtPeriodEnd ? "cancels at period end" : null,
          credits.subscriptionId ? "gateway-billed" : credits.plan && credits.plan !== "free" ? "no gateway subscription (comped)" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        {lots.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No credit lots</p>
        ) : (
          <div className="fd-scroll-thin overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[12px] text-muted-foreground">
                <tr className="border-b border-border bg-surface-sunken/60">
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 text-right font-medium">Granted</th>
                  <th className="px-3 py-2 text-right font-medium">Remaining</th>
                  <th className="px-3 py-2 font-medium">Granted on</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lots.map((lot, index) => {
                  const live = liveLots.includes(lot);
                  return (
                    <tr key={lot._id ?? index} className={cn(!live && "text-muted-foreground")}>
                      <td className="px-4 py-2">
                        <Badge variant={lot.source === "pack" ? "warning" : lot.source === "plan" ? "primary" : "default"}>{lot.source ?? "?"}</Badge>{" "}
                        <span className="text-[12px] text-muted-foreground">{lot.planKey ?? lot.packKey ?? ""}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(lot.amount)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{num(lot.remaining)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtDate(lot.grantedAt, "d MMM yyyy")}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {lot.expiresAt ? fmtDate(lot.expiresAt, "d MMM yyyy") : "never"}
                        {!live && (lot.remaining ?? 0) > 0 ? <Badge variant="danger" className="ml-2">expired</Badge> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {balance !== liveTotal ? (
              <p className="border-t border-border px-4 py-2 text-[12px] text-warning">
                Balance ({num(balance)}) differs from live lots ({num(liveTotal)}): edited by hand.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      {/* Everything this seller owns */}
      <div className="space-y-3">
        <nav className="fd-scroll-thin -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Seller data">
          {[...TABS, "details" as const].map((name) => {
            const active = tab === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => switchTab(name)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {name === "details" ? "Raw record" : SMOL_COLLECTIONS[name].label}
                {name !== "details" ? <span className="text-[11px] tabular-nums text-muted-foreground">{num(related.counts[name])}</span> : null}
              </button>
            );
          })}
        </nav>
        {tab === "details" ? (
          <section className="fd-panel p-4">
            <RecordFields doc={doc} />
          </section>
        ) : (
          <CollectionView key={tab} name={(TABS as string[]).includes(tab) ? (tab as SmolCollectionName) : "orders"} lockedStoreId={id} embedded />
        )}
      </div>
    </div>
  );
}

/** Irreversible: typing the store's domain arms the button. */
function DeleteSeller({ id, domain, storeName }: { id: string; domain: string; storeName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      const result = await api.delete<{ r2Files: number; r2Skipped: number; firebaseFailed: string[]; customDomain: string | null; customDomainSkipped: boolean }>(
        `/api/smol/stores/${id}${qs({ confirm: typed })}`,
      );
      const left = [
        result.r2Skipped ? `${result.r2Skipped} R2 files (SMOL_R2_* not set)` : null,
        result.firebaseFailed.length ? `${result.firebaseFailed.length} legacy Firebase files` : null,
        result.customDomainSkipped ? `custom domain ${result.customDomain} on Vercel (SMOL_VERCEL_* not set)` : null,
      ].filter(Boolean);
      if (left.length) toast.warning(`${storeName} deleted from the database. Left behind: ${left.join(", ")}`);
      else toast.success(`${storeName} deleted with ${result.r2Files} files`);
      router.replace("/smol/stores");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete seller");
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)} disabled={!domain}>
        <Trash2 /> Delete seller
      </Button>
      <Dialog open={open} onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          setTyped("");
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {storeName}?</DialogTitle>
            <DialogDescription>
              Permanently removes the store, its custom domain and uploaded images and videos (when R2/Vercel access is configured), and all of its orders, products, customers, reviews,
              coupons, credits, billing and support records. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1 text-[13px]">
            <label htmlFor="confirm-domain">
              Type <span className="font-mono font-semibold">{domain}</span> to confirm
            </label>
            <Input id="confirm-domain" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy || typed !== domain}>
              {busy ? "Deleting…" : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
