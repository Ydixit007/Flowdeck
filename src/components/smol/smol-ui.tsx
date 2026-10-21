"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ExternalLink, Store } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import {
  SMOL_COLLECTIONS,
  SMOL_PERIODS,
  getPath,
  periodRange,
  type SmolCollectionName,
  type SmolColumn,
} from "@/lib/smol-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Row = Record<string, unknown> & { _id: string };

export interface SmolMeta {
  counts: Record<string, number>;
  stores: { id: string; name: string; domain: string }[];
}

// ─── Formatting ────────────────────────────────────────────────────────────

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
export const money = (value: unknown) => inr.format(Number(value ?? 0));
export const moneyShort = (value: unknown) => inrCompact.format(Number(value ?? 0));
export const num = (value: unknown) => Number(value ?? 0).toLocaleString("en-IN");
export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
export function fmtDate(value: unknown, pattern = "d MMM yy, HH:mm"): string {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? format(date, pattern) : "—";
}

export function badgeVariant(value: string) {
  if (/^(paid|delivered|active|approved|true|confirmed|grant|topup|published|ok)$/i.test(value)) return "success" as const;
  if (/^(pending|processing|shipped|past_due|paused|low)$/i.test(value)) return "warning" as const;
  if (/^(cancelled|refunded|failed|rejected|expired|charge|deleted|blocked|abandoned)$/i.test(value)) return "danger" as const;
  if (/^(starter|growth|pro)$/i.test(value)) return "primary" as const;
  return "default" as const;
}

export const sellerHref = (id: string) => `/smol/seller/${id}`;

// ─── Context: seller names + global record dialog ──────────────────────────

interface SmolContextValue {
  meta: SmolMeta | null;
  storeName: (id: string) => string;
  openRecord: (name: SmolCollectionName, id: string) => void;
}

export const SmolContext = React.createContext<SmolContextValue>({
  meta: null,
  storeName: (id) => id.slice(-6),
  openRecord: () => undefined,
});
export const useSmol = () => React.useContext(SmolContext);

// ─── URL state: filters live in the query string so views are linkable ────

type ParamValue = string | number | string[] | null | undefined;

export function useUrlState() {
  const params = useSearchParams();

  const set = React.useCallback(
    (patch: Record<string, ParamValue>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key);
        if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
        else if (value !== null && value !== undefined && value !== "") next.set(key, String(value));
      }
      // Native history keeps useSearchParams in sync without a server round trip.
      const text = next.toString();
      window.history.replaceState(null, "", text ? `?${text}` : window.location.pathname);
    },
    [params],
  );

  return { params, get: (key: string) => params.get(key) ?? "", set };
}

// ─── Data: one fetch pattern for every view ────────────────────────────────

/** GETs `url` (null = idle); the last data stays while the next loads, and `reload()` refetches that url with fresh=1. */
export function useSmolFetch<T>(url: string | null) {
  // Reload is tied to its url, so changing filters afterwards goes back through the server cache.
  const [reloaded, setReloaded] = React.useState({ url: "", n: 0 });
  const n = reloaded.url === url ? reloaded.n : 0;
  const key = url ? `${url}#${n}` : "";
  const [loaded, setLoaded] = React.useState<{ key: string; data?: T; error?: string } | null>(null);

  React.useEffect(() => {
    if (!url) return;
    let cancelled = false;
    api
      .get<T>(n ? `${url}${url.includes("?") ? "&" : "?"}fresh=1` : url)
      .then((data) => !cancelled && setLoaded({ key, data }))
      .catch(
        (err: unknown) =>
          !cancelled && setLoaded((prev) => ({ key, data: prev?.data, error: err instanceof Error ? err.message : "Could not load" })),
      );
    return () => {
      cancelled = true;
    };
  }, [url, n, key]);

  const loading = Boolean(url) && loaded?.key !== key;
  return {
    data: loaded?.data ?? null,
    error: loading ? null : (loaded?.error ?? null),
    loading,
    reload: () => url && setReloaded({ url, n: n + 1 }),
  };
}

// ─── Building blocks ───────────────────────────────────────────────────────

/** Compact native select with a visible chevron. */
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <NativeSelect {...props} className="h-8 w-auto max-w-56 truncate py-0 pl-2.5 pr-7 text-[13px]" />
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}


export function Cell({ column, row }: { column: SmolColumn; row: Row }) {
  const { storeName } = useSmol();
  const value = getPath(row, column.key);
  if (column.kind === "resolved")
    return value ? (
      <Badge variant="success" title={fmtDate(value)}>resolved</Badge>
    ) : (
      <Badge variant="warning">open</Badge>
    );
  if (value === undefined || value === null || value === "") return <span className="text-muted-foreground/50">—</span>;
  switch (column.kind) {
    case "money":
      return <span className="tabular-nums">{money(value)}</span>;
    case "number":
      return <span className="tabular-nums">{num(value)}</span>;
    case "date":
      return (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground" title={String(value)}>
          {fmtDate(value)}
        </span>
      );
    case "bool":
      return <Badge variant={value ? "success" : "outline"}>{value ? "yes" : "no"}</Badge>;
    case "badge":
      return <Badge variant={badgeVariant(String(value))}>{String(value)}</Badge>;
    case "store":
      return (
        <Link
          href={sellerHref(String(value))}
          onClick={(event) => event.stopPropagation()}
          className="whitespace-nowrap font-medium hover:text-primary hover:underline"
        >
          {storeName(String(value))}
        </Link>
      );
    case "long":
      return <span className="line-clamp-2 min-w-48 max-w-80 text-muted-foreground">{String(value)}</span>;
    default:
      return <span className="whitespace-nowrap">{String(value)}</span>;
  }
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("fd-panel flex min-w-0 flex-col overflow-hidden", className)}>
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold">{title}</h2>
          {description ? <p className="truncate text-[11px] text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** Change vs previous period; `invert` for metrics where down is good. */
export function Delta({ current, previous, invert }: { current: number; previous?: number | null; invert?: boolean }) {
  if (previous === undefined || previous === null) return null;
  if (previous === 0 && current === 0) return <span className="text-[11px] text-muted-foreground">no change</span>;
  const change = previous === 0 ? null : ((current - previous) / previous) * 100;
  const up = current >= previous;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-[11px] font-medium tabular-nums",
        good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}
      title={`Previous period: ${previous.toLocaleString("en-IN")}`}
    >
      <Icon className="size-3" />
      {change === null ? "new" : `${Math.abs(change).toFixed(change > -10 && change < 10 ? 1 : 0)}%`}
    </span>
  );
}

export function Kpi({
  label,
  value,
  hint,
  icon,
  delta,
  href,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  delta?: React.ReactNode;
  href?: string;
  tone?: "warning" | "danger";
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {icon ? <span className="[&_svg]:size-3.5">{icon}</span> : null}
        <span className="flex-1 truncate">{label}</span>
        {delta}
      </div>
      <p
        className={cn(
          "mt-1.5 truncate text-[22px] font-semibold leading-tight tracking-tight tabular-nums",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </>
  );
  const className = "fd-panel block min-w-0 px-4 py-3";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:border-border-strong")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Horizontal bar list for small categorical breakdowns. */
export function BarList({
  rows,
  format: fmt = num,
  empty = "No data in this period",
}: {
  rows: { label: React.ReactNode; value: number; href?: string; key: string }[];
  format?: (value: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1 p-2">
      {rows.map((row) => {
        const inner = (
          <>
            <span
              className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
              style={{ width: `${(row.value / max) * 100}%` }}
              aria-hidden
            />
            <span className="relative min-w-0 flex-1 truncate">{row.label}</span>
            <span className="relative tabular-nums text-muted-foreground">{fmt(row.value)}</span>
          </>
        );
        const cls = "relative flex items-center gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-[13px]";
        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className={cn(cls, "hover:bg-muted/60")}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Preset periods + custom range. Value is URL-shaped: { period, from, to }. */
export function PeriodPicker({
  period,
  from,
  to,
  onChange,
  allowAny,
}: {
  period: string;
  from: string;
  to: string;
  onChange: (next: { period: string; from?: string; to?: string }) => void;
  /** Lists get an "Any time" option instead of the segmented control. */
  allowAny?: boolean;
}) {
  const custom = period === "custom";
  const setCustom = (patch: { from?: string; to?: string }) => {
    const seed = custom ? { from, to } : periodRange(period);
    onChange({ period: "custom", from: seed.from ?? "", to: seed.to ?? "", ...patch });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowAny ? (
        <Select value={period} onChange={(event) => onChange({ period: event.target.value })} aria-label="Date range">
          <option value="">Any time</option>
          {SMOL_PERIODS.filter((p) => p.key !== "all").map((p) => (
            <option key={p.key} value={p.key}>
              {p.key === "today" ? "Today" : p.key === "ytd" ? "Year to date" : `Last ${p.label.replace("D", " days").replace("M", " months")}`}
            </option>
          ))}
          <option value="custom">Custom range…</option>
        </Select>
      ) : (
        <div role="group" aria-label="Period" className="flex items-center rounded-lg border border-border bg-surface-sunken p-0.5">
          {[...SMOL_PERIODS, { key: "custom", label: "Custom" } as const].map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => (p.key === "custom" ? setCustom({}) : onChange({ period: p.key }))}
              className={cn(
                "h-7 rounded-md px-2 text-[12px] font-medium tabular-nums transition-colors",
                period === p.key ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {custom ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setCustom({ from: event.target.value })}
            className="h-8 w-[8.5rem] py-0 text-[13px]"
            aria-label="From date"
          />
          <span className="text-[12px] text-muted-foreground">→</span>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setCustom({ to: event.target.value })}
            className="h-8 w-[8.5rem] py-0 text-[13px]"
            aria-label="To date"
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── Record dialog (any collection) ────────────────────────────────────────

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground/50">—</span>;
  if (typeof value === "boolean") return <Badge variant={value ? "success" : "outline"}>{String(value)}</Badge>;
  if (typeof value === "object") {
    return (
      <pre className="fd-scroll-thin max-h-72 overflow-auto rounded-md bg-surface-sunken p-2 text-[11px] leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  const text = String(value);
  if (/^https?:\/\//.test(text)) {
    return (
      <a href={text} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
        {text.length > 80 ? `${text.slice(0, 80)}…` : text} <ExternalLink className="size-3 shrink-0" />
      </a>
    );
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return <span className="tabular-nums">{fmtDate(text, "d MMM yyyy, HH:mm:ss")}</span>;
  return <span className="whitespace-pre-wrap break-words">{text}</span>;
}

/** Full key/value dump of a record; nested objects render as JSON. */
export function RecordFields({ doc }: { doc: Row }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[180px_1fr]">
      {Object.entries(doc)
        .filter(([key]) => key !== "__v")
        .map(([key, value]) => (
          <React.Fragment key={key}>
            <dt className="pt-0.5 font-medium text-muted-foreground">{key}</dt>
            <dd className="min-w-0">
              <Value value={value} />
            </dd>
          </React.Fragment>
        ))}
    </dl>
  );
}

export function recordTitle(doc: Row): string {
  const name = [doc.firstName, doc.lastName].filter(Boolean).join(" ");
  return String(doc.storeName ?? doc.orderNumber ?? doc.name ?? doc.code ?? doc.title ?? doc.label ?? (name || doc._id));
}

export function RecordDialog({
  target,
  onClose,
  onOpen,
}: {
  target: { name: SmolCollectionName; id: string } | null;
  onClose: () => void;
  onOpen: (name: SmolCollectionName, id: string) => void;
}) {
  const { storeName } = useSmol();
  const fetched = useSmolFetch<{ doc: Row; related: Record<string, unknown> | null }>(target ? `/api/smol/${target.name}/${target.id}` : null);
  // Never show the previous record under a new target.
  const data = fetched.loading || fetched.error ? null : fetched.data;
  const error = fetched.error;
  const doc = data?.doc;
  const storeId = doc && typeof doc.storeId === "string" ? doc.storeId : null;
  const customerOrders = data?.related?.orders as Row[] | undefined;

  return (
    <Dialog open={Boolean(target)} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent size="xl" className="max-h-[90dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            <span className="truncate">{doc ? recordTitle(doc) : "Loading…"}</span>
            {target ? <Badge variant="outline">{SMOL_COLLECTIONS[target.name].label}</Badge> : null}
            {typeof doc?.status === "string" ? <Badge variant={badgeVariant(doc.status)}>{doc.status}</Badge> : null}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="fd-scroll-thin max-h-[75dvh] space-y-4 overflow-y-auto">
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
          {!doc && !error ? <Skeleton className="h-40 w-full" /> : null}

          {storeId ? (
            <Button asChild variant="secondary" size="sm" onClick={onClose}>
              <Link href={sellerHref(storeId)}>
                <Store /> {storeName(storeId)}
              </Link>
            </Button>
          ) : null}

          {customerOrders && doc ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold">Orders ({customerOrders.length})</p>
                <Button asChild variant="link" size="sm" onClick={onClose}>
                  <Link href={`/smol/orders?storeId=${storeId ?? ""}&phone=${encodeURIComponent(String(doc.phone))}`}>
                    Open in Orders
                  </Link>
                </Button>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border">
                {customerOrders.map((order) => (
                  <li key={order._id}>
                    <button
                      type="button"
                      onClick={() => onOpen("orders", order._id)}
                      className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-muted/50"
                    >
                      <span className="flex-1 font-medium">{String(order.orderNumber)}</span>
                      <span className="text-[12px] text-muted-foreground">{fmtDate(order.createdAt, "d MMM yy")}</span>
                      <Badge variant={badgeVariant(String(order.paymentStatus))}>{String(order.paymentStatus)}</Badge>
                      <Badge variant={badgeVariant(String(order.status))}>{String(order.status)}</Badge>
                      <span className="w-16 text-right tabular-nums">{money(order.totalAmount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {doc ? <RecordFields doc={doc} /> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
