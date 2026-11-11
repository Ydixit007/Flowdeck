"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Plus, Rows3, Rows4, RotateCcw, Search, Undo2, X } from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SMOL_ANNOUNCEMENT_TYPES, SMOL_RESOLVABLE, periodRange, visibleCollection, type SmolCollectionName, type SmolColumn } from "@/lib/smol-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Cell, PeriodPicker, Select, fmtDate, sellerHref, useSmol, useSmolFetch, useUrlState, type Row } from "@/components/smol/smol-ui";
import { EmailBudget, OtpLimit } from "@/components/smol/admin-tools";

interface ListResult {
  rows: Row[];
  total: number;
  page: number;
  limit: number;
  sort: string;
  dir: "asc" | "desc";
}

// Filter values barely change; fetch once per collection per session.
const optionsCache = new Map<string, Promise<Record<string, string[]>>>();
function filterOptions(name: string) {
  let hit = optionsCache.get(name);
  if (!hit) {
    hit = api.get<Record<string, string[]>>(`/api/smol/${name}?options=1`);
    hit.catch(() => optionsCache.delete(name));
    optionsCache.set(name, hit);
  }
  return hit;
}

const numeric = (column: SmolColumn) => column.kind === "money" || column.kind === "number";

const DESCRIPTIONS: Record<SmolCollectionName, string> = {
  stores: "Every store on the platform, its plan and status.",
  storelayoutrevisions: "Published storefront layouts, newest first.",
  orders: "Buyer orders across all stores.",
  customers: "Buyers, per store.",
  products: "Catalogue items across all stores.",
  reviews: "Verified-purchase reviews.",
  coupons: "Store discount codes and their usage.",
  billingorders: "What sellers paid the platform: packs and plans.",
  credittransactions: "Every credit grant, charge and expiry.",
  emailbudgets: "Platform-wide daily email sends.",
  announcements: "Messages shown in every seller dashboard.",
  themes: "Storefront themes available to sellers.",
  featurerequests: "What sellers asked for.",
  contacts: "Messages sellers sent from Settings → Contact us.",
  adminactions: "Every change an admin made through these controls.",
  otps: "Login and checkout codes sent.",
};
const MAX_STATUS_TABS = 8;

/** Row density, remembered per browser. */
const densityListeners = new Set<() => void>();
const readCompact = () => {
  try {
    return window.localStorage.getItem("fd-density") === "compact";
  } catch {
    return false;
  }
};
function useDensity() {
  const compact = React.useSyncExternalStore(
    (listener) => (densityListeners.add(listener), () => densityListeners.delete(listener)),
    readCompact,
    () => false,
  );
  const toggle = () => {
    try {
      window.localStorage.setItem("fd-density", compact ? "comfortable" : "compact");
    } catch {}
    densityListeners.forEach((listener) => listener());
  };
  return [compact, toggle] as const;
}

/** Searchable, filterable, sortable table; every control lives in the URL so views are linkable. */
export function CollectionView({
  name,
  lockedStoreId,
  embedded,
}: {
  name: SmolCollectionName;
  /** Seller page: pin the seller and hide the seller filter. */
  lockedStoreId?: string;
  embedded?: boolean;
}) {
  const { role, meta, storeName, openRecord } = useSmol();
  const def = visibleCollection(name, role);
  const router = useRouter();
  const url = useUrlState();

  const storeScoped = !!def.storeScoped;
  const storeId = lockedStoreId ?? url.get("storeId");
  const phone = url.get("phone");
  const period = url.get("period");
  const range = periodRange(period, { from: url.get("from"), to: url.get("to") });
  const sort = url.get("sort") || def.defaultSort;
  const dir = url.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(url.get("page")) || 1);
  const limit = [25, 50, 100].includes(Number(url.get("limit"))) ? Number(url.get("limit")) : 25;
  const allowed = new Set<string>(def.filters.map((filter) => filter.key));
  const f = url.params.getAll("f").filter((pair) => allowed.has(pair.slice(0, pair.indexOf(":"))));
  const filters = Object.fromEntries(f.map((pair) => [pair.slice(0, pair.indexOf(":")), pair.slice(pair.indexOf(":") + 1)]));

  // Search box is local for instant typing; the URL follows after a short pause.
  const urlQ = url.get("q");
  const [q, setQ] = React.useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = React.useState(urlQ);
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setQ(urlQ);
  }
  const { set } = url;
  React.useEffect(() => {
    if (q === urlQ) return;
    const timer = window.setTimeout(() => set({ q, page: null }), 300);
    return () => window.clearTimeout(timer);
  }, [q, urlQ, set]);

  const [options, setOptions] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    if (def.filters.length === 0) return;
    void filterOptions(name).then(setOptions).catch(() => undefined);
  }, [name, def.filters.length]);

  const { data: result, error, loading, reload } = useSmolFetch<ListResult>(
    `/api/smol/${name}${qs({ q: urlQ, storeId, phone, f, from: range.from, to: range.to, sort, dir, page, limit })}`,
  );

  const setFilter = (key: string, value: string) => {
    const next = { ...filters, [key]: value };
    set({ f: Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`), page: null });
  };
  const toggleSort = (key: string) => {
    if (sort === key) set({ dir: dir === "asc" ? "desc" : "asc", page: null });
    else set({ sort: key, dir: "desc", page: null });
  };
  const reset = () => {
    setQ("");
    set({ q: null, storeId: null, phone: null, f: null, period: null, from: null, to: null, page: null, sort: null, dir: null });
  };
  const columns = lockedStoreId ? def.columns.filter((column: SmolColumn) => column.kind !== "store") : def.columns;
  const resolvable = SMOL_RESOLVABLE.has(name);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [composing, setComposing] = React.useState(false);
  const toggleResolved = async (row: Row) => {
    setBusy(row._id);
    setActionError(null);
    try {
      await api.patch(`/api/smol/${name}/${row._id}`, { resolved: !row.resolvedAt });
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(null);
    }
  };
  const openRow = (row: Row) => (name === "stores" ? router.push(sellerHref(row._id)) : openRecord(name, row._id));

  const [compact, toggleDensity] = useDensity();
  const statusFilter = def.filters[0];
  const statusOptions = statusFilter ? (options[statusFilter.key] ?? []) : [];
  const statusTabs = statusOptions.length > 1 && statusOptions.length <= MAX_STATUS_TABS ? statusFilter : undefined;
  const selectFilters = statusTabs ? def.filters.slice(1) : def.filters;
  const cellY = compact ? "py-1.5" : "py-2.5";

  const total = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const chips: { label: string; clear: () => void }[] = [
    ...(urlQ ? [{ label: `“${urlQ}”`, clear: () => (setQ(""), set({ q: null, page: null })) }] : []),
    ...(storeId && !lockedStoreId ? [{ label: `Seller: ${storeName(storeId)}`, clear: () => set({ storeId: null, page: null }) }] : []),
    ...(phone ? [{ label: `Phone: ${phone}`, clear: () => set({ phone: null, page: null }) }] : []),
    ...def.filters
      .filter((filter) => filters[filter.key] && filter.key !== statusTabs?.key)
      .map((filter) => ({ label: `${filter.label}: ${filters[filter.key]}`, clear: () => setFilter(filter.key, "") })),
    ...(period
      ? [
          {
            label: `${range.from ? fmtDate(range.from, "d MMM yy") : "…"} → ${range.to ? fmtDate(range.to, "d MMM yy") : "…"}`,
            clear: () => set({ period: null, from: null, to: null, page: null }),
          },
        ]
      : []),
  ];

  return (
    <div className={cn(!embedded && "mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:p-5")}>
      {!embedded ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              {def.label}
              {meta ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-[12px] font-medium tabular-nums text-muted-foreground">{(meta.counts[name] ?? 0).toLocaleString("en-IN")}</span> : null}
            </h2>
            <p className="text-[12px] text-muted-foreground">{DESCRIPTIONS[name]}</p>
          </div>
          {name === "announcements" ? (
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus /> New announcement
            </Button>
          ) : null}
        </div>
      ) : null}

      {!embedded && role === "superadmin" && name === "emailbudgets" ? <EmailBudget /> : null}
      {!embedded && role === "superadmin" && name === "otps" ? (
        <section className="fd-panel space-y-1 p-3">
          <p className="text-[13px] font-medium">OTP send limit</p>
          <OtpLimit />
        </section>
      ) : null}

      <section className="fd-panel overflow-hidden">
        {statusTabs ? (
          <nav className="fd-no-scrollbar flex gap-1 overflow-x-auto border-b border-border px-3" aria-label={statusTabs.label}>
            {["", ...statusOptions].map((value) => {
              const active = (filters[statusTabs.key] ?? "") === value;
              return (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => setFilter(statusTabs.key, value)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-2.5 py-2.5 text-[13px] font-medium capitalize transition-colors",
                    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value ? value.replace(/_/g, " ") : "All"}
                </button>
              );
            })}
          </nav>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={`Search ${def.search.map((s) => s.split(".").pop()).join(", ")} or ID`}
              className="h-8 pl-8 text-[13px]"
              aria-label={`Search ${def.label}`}
            />
          </div>
          {storeScoped && !lockedStoreId ? (
            <Select value={storeId} onChange={(event) => set({ storeId: event.target.value, page: null })} aria-label="Filter by seller">
              <option value="">All sellers</option>
              {(meta?.stores ?? []).map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
          ) : null}
          {selectFilters.map((filter) => (
            <Select
              key={filter.key}
              value={filters[filter.key] ?? ""}
              onChange={(event) => setFilter(filter.key, event.target.value)}
              aria-label={filter.label}
            >
              <option value="">{filter.label}: all</option>
              {(options[filter.key] ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          ))}
          <PeriodPicker
            allowAny
            period={period}
            from={url.get("from")}
            to={url.get("to")}
            onChange={(next) => set({ period: next.period, from: next.from ?? null, to: next.to ?? null, page: null })}
          />
        </div>

        {chips.length ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-sunken/40 px-3 py-2">
            {chips.map((chip) => (
              <Badge key={chip.label} variant="primary" className="gap-1 pr-1">
                {chip.label}
                <button type="button" onClick={chip.clear} aria-label={`Remove ${chip.label}`} className="rounded hover:bg-primary/15">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-[12px]" onClick={reset}>
              <RotateCcw /> Clear all
            </Button>
          </div>
        ) : null}

        {actionError ? <p className="border-b border-border px-3 py-2 text-[13px] text-destructive">{actionError}</p> : null}

        <div className="fd-scroll-thin overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr className="border-b border-border bg-surface-sunken">
                {columns.map((column: SmolColumn) => {
                  const active = sort === column.key;
                  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th
                      key={column.key}
                      className={cn("px-3 py-2 font-medium first:sticky first:left-0 first:z-[1] first:bg-surface-sunken", numeric(column) && "text-right")}
                      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          "group inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground",
                          active && "text-foreground",
                        )}
                      >
                        {column.label}
                        <Icon className={cn("size-3", !active && "opacity-0 group-hover:opacity-60")} />
                      </button>
                    </th>
                  );
                })}
                {resolvable ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody className={cn("divide-y divide-border transition-opacity", loading && result && "opacity-60")}>
              {!result && loading
                ? Array.from({ length: 8 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={columns.length + (resolvable ? 1 : 0)} className="px-3 py-2">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : result?.rows.map((row) => (
                    <tr
                      key={row._id}
                      tabIndex={0}
                      className="cursor-pointer bg-surface outline-none hover:bg-muted focus-visible:bg-muted"
                      onClick={() => openRow(row)}
                      onKeyDown={(event) => event.key === "Enter" && openRow(row)}
                    >
                      {columns.map((column: SmolColumn) => (
                        <td key={column.key} className={cn("px-3 first:sticky first:left-0 first:z-[1] first:bg-inherit first:font-medium", cellY, numeric(column) && "text-right")}>
                          <Cell column={column} row={row} />
                        </td>
                      ))}
                      {resolvable ? (
                        <td className="px-3 py-1 text-right">
                          <Button
                            variant={row.resolvedAt ? "ghost" : "secondary"}
                            size="sm"
                            className="h-7 text-[12px]"
                            disabled={busy === row._id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggleResolved(row);
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {row.resolvedAt ? <Undo2 /> : <Check />} {row.resolvedAt ? "Reopen" : "Resolve"}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
            </tbody>
          </table>
          {error ? <EmptyState icon={<Search />} title="Could not load" description={error} /> : null}
          {result && result.rows.length === 0 && !loading && !error ? (
            <EmptyState
              icon={<Search />}
              title="Nothing matches"
              description={chips.length ? "Try removing a filter." : "This collection is empty."}
            />
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
          <span className="tabular-nums">
            {total === 0 ? "0 results" : `${((page - 1) * limit + 1).toLocaleString("en-IN")}–${Math.min(page * limit, total).toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={toggleDensity} aria-label={compact ? "Comfortable rows" : "Compact rows"} title={compact ? "Comfortable rows" : "Compact rows"}>
              {compact ? <Rows3 /> : <Rows4 />}
            </Button>
            <Select value={limit} onChange={(event) => set({ limit: event.target.value, page: null })} aria-label="Rows per page">
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => set({ page: page - 1 })} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <Button variant="ghost" size="icon-sm" disabled={page >= pages} onClick={() => set({ page: page + 1 })} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </footer>
      </section>
      {name === "announcements" ? (
        <AnnouncementDialog open={composing} onClose={() => setComposing(false)} onSaved={reload} />
      ) : null}
    </div>
  );
}

/** Create, or with `initial` edit (SMOL-416); a cleared optional field is removed. */
export function AnnouncementDialog({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved: () => void; initial?: Row }) {
  const text = (key: string) => (typeof initial?.[key] === "string" ? String(initial[key]) : undefined);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const body = { ...Object.fromEntries(form), published: form.get("published") === "on" };
      if (initial) await api.patch(`/api/smol/announcements/${initial._id}`, body);
      else await api.post("/api/smol/announcements", body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent size="lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{initial ? "Edit announcement" : "New announcement"}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 text-[13px] sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="a-title">Title</Label>
              <Input id="a-title" name="title" required maxLength={140} defaultValue={text("title")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="a-content">Content</Label>
              <Textarea id="a-content" name="content" required maxLength={4000} rows={5} defaultValue={text("content")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-type">Type</Label>
              <Select id="a-type" name="type" defaultValue={text("type") ?? "feature"} className="w-full">
                {SMOL_ANNOUNCEMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-released">Released</Label>
              <Input id="a-released" name="releasedAt" type="date" defaultValue={initial ? fmtDate(initial.releasedAt, "yyyy-MM-dd") : new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-link">Link URL (optional)</Label>
              <Input
                id="a-link"
                name="linkUrl"
                maxLength={2048}
                defaultValue={text("linkUrl")}
                placeholder="/seller/dashboard/… or https://…"
                pattern="(/(?!/)|https?://)\S*"
                title="A /path in the seller dashboard or an http(s) URL"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-label">Link label</Label>
              <Input id="a-label" name="linkLabel" maxLength={40} defaultValue={text("linkLabel")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="a-image">Image URL (optional)</Label>
              <Input id="a-image" name="imageUrl" type="url" maxLength={2048} defaultValue={text("imageUrl")} />
            </div>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" name="published" defaultChecked={initial ? initial.published === true : true} /> Published (unchecked = draft, hidden from sellers)
            </label>
            {error ? <p className="text-destructive sm:col-span-2">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : initial ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
