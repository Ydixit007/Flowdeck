"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw, Search, X } from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SMOL_COLLECTIONS, periodRange, type SmolCollectionName, type SmolColumn } from "@/lib/smol-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Cell, PeriodPicker, Select, fmtDate, sellerHref, useSmol, useSmolFetch, useUrlState, type Row } from "@/components/smol/smol-ui";

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
  const def = SMOL_COLLECTIONS[name];
  const router = useRouter();
  const { meta, storeName, openRecord } = useSmol();
  const url = useUrlState();

  const storeScoped = "storeScoped" in def;
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

  const { data: result, error, loading } = useSmolFetch<ListResult>(
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
  const openRow = (row: Row) => (name === "stores" ? router.push(sellerHref(row._id)) : openRecord(name, row._id));

  const total = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const chips: { label: string; clear: () => void }[] = [
    ...(urlQ ? [{ label: `“${urlQ}”`, clear: () => (setQ(""), set({ q: null, page: null })) }] : []),
    ...(storeId && !lockedStoreId ? [{ label: `Seller: ${storeName(storeId)}`, clear: () => set({ storeId: null, page: null }) }] : []),
    ...(phone ? [{ label: `Phone: ${phone}`, clear: () => set({ phone: null, page: null }) }] : []),
    ...def.filters
      .filter((filter) => filters[filter.key])
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
            <h2 className="text-lg font-semibold tracking-tight">{def.label}</h2>
            <p className="text-[12px] text-muted-foreground">
              {meta ? `${(meta.counts[name] ?? 0).toLocaleString("en-IN")} records in total` : " "} · click a row for details
            </p>
          </div>
        </div>
      ) : null}

      <section className="fd-panel overflow-hidden">
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
          {def.filters.map((filter) => (
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

        <div className="fd-scroll-thin overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr className="border-b border-border bg-surface-sunken/60">
                {columns.map((column: SmolColumn) => {
                  const active = sort === column.key;
                  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th
                      key={column.key}
                      className={cn("px-3 py-2 font-medium", numeric(column) && "text-right")}
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
              </tr>
            </thead>
            <tbody className={cn("divide-y divide-border transition-opacity", loading && result && "opacity-60")}>
              {!result && loading
                ? Array.from({ length: 8 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={columns.length} className="px-3 py-2">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : result?.rows.map((row) => (
                    <tr
                      key={row._id}
                      tabIndex={0}
                      className="cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
                      onClick={() => openRow(row)}
                      onKeyDown={(event) => event.key === "Enter" && openRow(row)}
                    >
                      {columns.map((column: SmolColumn) => (
                        <td key={column.key} className={cn("px-3 py-2", numeric(column) && "text-right")}>
                          <Cell column={column} row={row} />
                        </td>
                      ))}
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
    </div>
  );
}
