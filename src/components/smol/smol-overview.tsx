"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BadgeIndianRupee,
  Coins,
  CreditCard,
  Crown,
  Gift,
  RefreshCw,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Store,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { qs } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SMOL_LOW_BALANCE, SMOL_ORDER_STATUSES, SMOL_PLAN_ORDER, getPath, periodRange } from "@/lib/smol-config";
import type { SmolIntel } from "@/server/smol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import {
  BarList,
  Delta,
  Kpi,
  Panel,
  PeriodPicker,
  Select,
  badgeVariant,
  fmtDate,
  money,
  moneyShort,
  num,
  pct,
  sellerHref,
  useSmol,
  useSmolFetch,
  useUrlState,
} from "@/components/smol/smol-ui";

const METRICS = [
  { key: "gmv", label: "GMV", format: money },
  { key: "orders", label: "Orders", format: num },
  { key: "creditsUsed", label: "Credits used", format: num },
  { key: "billingRevenue", label: "Billing ₹", format: money },
  { key: "newSellers", label: "New sellers", format: num },
] as const;
type Metric = (typeof METRICS)[number]["key"];

type SellerRow = SmolIntel["sellers"][number];
const SELLER_SORTS: { key: keyof SellerRow; label: string; numeric?: boolean }[] = [
  { key: "gmv", label: "GMV", numeric: true },
  { key: "orders", label: "Orders", numeric: true },
  { key: "creditsUsed", label: "Credits used", numeric: true },
  { key: "balance", label: "Balance", numeric: true },
  { key: "lastOrderAt", label: "Last order" },
];

const TrendChart = dynamic(() => import("@/components/smol/trend-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export function SmolOverview() {
  const url = useUrlState();
  const { storeName } = useSmol();
  const period = url.get("period") || "30d";
  const range = periodRange(period, { from: url.get("from"), to: url.get("to") });
  const interval = url.get("interval") || "auto";
  const [metric, setMetric] = React.useState<Metric>("gmv");
  const [sellerSort, setSellerSort] = React.useState<{ key: keyof SellerRow; dir: 1 | -1 }>({ key: "gmv", dir: -1 });

  const { data, error, loading, reload } = useSmolFetch<SmolIntel>(`/api/smol/intel${qs({ from: range.from, to: range.to, interval })}`);
  const loadedAt = data ? new Date(data.generatedAt) : null;

  // Drill-downs carry the same window into the list views.
  const periodParams = period === "all" ? {} : { period, from: url.get("from"), to: url.get("to") };
  const listHref = (name: string, extra: Record<string, string | string[]> = {}, windowed = true) =>
    `/smol/${name}${qs({ ...(windowed ? periodParams : {}), ...extra })}`;

  if (error && !data) return <EmptyState icon={<Store />} title="Could not load SmolBusiness" description={error} />;

  const c = data?.current;
  const p = data?.previous;
  const sellers = [...(data?.sellers ?? [])].sort((a, b) => {
    const x = a[sellerSort.key] ?? "";
    const y = b[sellerSort.key] ?? "";
    return (x < y ? -1 : x > y ? 1 : 0) * sellerSort.dir;
  });
  const top = data?.sellers[0];
  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const creditLeft = data ? data.credits.free + data.credits.plan + data.credits.pack : 0;
  const attentionCount = data
    ? data.attention.lowBalanceCount +
      (data.attention.pendingVerification ? 1 : 0) +
      (data.attention.pendingReviews ? 1 : 0) +
      (data.attention.pendingBilling.count ? 1 : 0) +
      data.subscriptions.pastDue
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 sm:p-5">
      {/* Header + period controls */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Platform overview</h2>
          <p className="text-[12px] text-muted-foreground">
            {data ? (
              <>
                {fmtDate(`${data.range.from}T00:00:00`, "d MMM yyyy")} – {fmtDate(`${data.range.to}T00:00:00`, "d MMM yyyy")}
                {data.range.compare ? (
                  <>
                    {" "}
                    · vs {fmtDate(`${data.range.prevFrom}T00:00:00`, "d MMM")} – {fmtDate(`${data.range.prevTo}T00:00:00`, "d MMM")}
                  </>
                ) : null}
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker
            period={period}
            from={url.get("from")}
            to={url.get("to")}
            onChange={(next) => url.set({ period: next.period === "30d" ? null : next.period, from: next.from ?? null, to: next.to ?? null })}
          />
          <Select
            value={interval}
            onChange={(event) => url.set({ interval: event.target.value === "auto" ? null : event.target.value })}
            aria-label="Group chart by"
          >
            <option value="auto">Auto</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={reload}
            aria-label="Refresh"
            title={loadedAt ? `Updated ${formatDistanceToNow(loadedAt, { addSuffix: true })}` : "Refresh"}
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {!data || !c ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="h-[92px]" />
          ))}
        </div>
      ) : (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          {/* KPIs */}
          <KpiGroup title="Commerce">
            <Kpi
              icon={<TrendingUp />}
              label="Paid GMV"
              value={money(c.gmv)}
              delta={<Delta current={c.gmv} previous={p?.gmv} />}
              hint={`${num(c.paidOrders)} paid orders · AOV ${money(c.paidOrders ? c.gmv / c.paidOrders : 0)}`}
            />
            <Kpi
              icon={<ShoppingBag />}
              label="Orders placed"
              value={num(c.orders)}
              delta={<Delta current={c.orders} previous={p?.orders} />}
              hint={`${pct(c.paidOrders, c.orders)} paid · ${pct(c.codOrders, c.orders)} COD`}
              href={listHref("orders")}
            />
            <Kpi
              icon={<ShoppingCart />}
              label="Abandoned carts"
              value={num(c.abandoned)}
              delta={<Delta current={c.abandoned} previous={p?.abandoned} invert />}
              hint={`${pct(c.abandoned, c.orders + c.abandoned)} of checkouts expired unpaid`}
              tone={c.abandoned > c.orders ? "warning" : undefined}
              href={listHref("orders", { f: "status:abandoned" })}
            />
            <Kpi
              icon={<Store />}
              label="Active sellers"
              value={num(c.activeSellers)}
              delta={<Delta current={c.activeSellers} previous={p?.activeSellers} />}
              hint={`of ${num(data.totalSellers)} sellers · ${num(c.newSellers)} joined`}
              href={listHref("stores", {}, false)}
            />
            <Kpi
              icon={<UserPlus />}
              label="New customers"
              value={num(c.newCustomers)}
              delta={<Delta current={c.newCustomers} previous={p?.newCustomers} />}
              href={listHref("customers")}
            />
          </KpiGroup>

          <KpiGroup title="Platform revenue">
            <Kpi
              icon={<BadgeIndianRupee />}
              label="Billing revenue"
              value={money(c.billingRevenue)}
              delta={<Delta current={c.billingRevenue} previous={p?.billingRevenue} />}
              hint={`Packs ${money(c.packRevenue)} · Plans ${money(c.subscriptionRevenue)}`}
              href={listHref("billingorders", { f: "status:paid" })}
            />
            <Kpi
              icon={<Repeat />}
              label="MRR"
              value={money(data.subscriptions.mrr)}
              hint={`ARR ${moneyShort(data.subscriptions.mrr * 12)} · right now`}
            />
            <Kpi
              icon={<CreditCard />}
              label="Paid subscribers"
              value={num(data.subscriptions.paid)}
              hint={
                [
                  data.subscriptions.comped ? `${data.subscriptions.comped} comped (no billing)` : null,
                  data.subscriptions.pastDue ? `${data.subscriptions.pastDue} past due` : null,
                  data.subscriptions.cancelling ? `${data.subscriptions.cancelling} cancelling` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Gateway-billed plans"
              }
            />
            <Kpi
              icon={<Coins />}
              label="Credits bought"
              value={num(c.creditsBought)}
              delta={<Delta current={c.creditsBought} previous={p?.creditsBought} />}
              hint={`${num(c.purchases)} paid purchases`}
            />
          </KpiGroup>

          <KpiGroup title="Credits">
            <Kpi
              icon={<Wallet />}
              label="Credits consumed"
              value={num(c.creditsUsed)}
              delta={<Delta current={c.creditsUsed} previous={p?.creditsUsed} />}
              hint={`${num(c.creditsGranted)} granted in period`}
              href={listHref("credittransactions", { f: "type:charge" })}
            />
            <Kpi
              icon={<Gift />}
              label="Free credits left"
              value={num(data.credits.free)}
              hint={`${pct(data.credits.free, creditLeft)} of live lots · signup + manual`}
            />
            <Kpi
              icon={<Coins />}
              label="Paid credits left"
              value={num(data.credits.plan + data.credits.pack)}
              hint={`Plan ${num(data.credits.plan)} · Pack ${num(data.credits.pack)} · ${num(data.credits.expiring7d)} expire ≤7d`}
            />
            <Kpi
              icon={<Users />}
              label="Balance outstanding"
              value={num(data.credits.outstanding)}
              hint={
                data.credits.outstanding !== creditLeft
                  ? `Lots hold ${num(creditLeft)}; the difference is manual balance edits`
                  : "Sum of seller balances"
              }
            />
          </KpiGroup>

          {/* Trend + top seller */}
          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <Panel
              title="Trend"
              description={`${activeMetric.label} per ${data.range.interval} · total ${activeMetric.format(
                data.series.reduce((sum, point) => sum + point[metric], 0),
              )}`}
              actions={
                <div role="group" aria-label="Metric" className="flex flex-wrap items-center rounded-lg border border-border bg-surface-sunken p-0.5">
                  {METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      aria-pressed={metric === m.key}
                      onClick={() => setMetric(m.key)}
                      className={cn(
                        "h-6 rounded-md px-2 text-[11px] font-medium transition-colors",
                        metric === m.key ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="h-64 px-2 pb-2 pt-4">
                <TrendChart
                  data={data.series}
                  dataKey={metric}
                  interval={data.range.interval}
                  label={activeMetric.label}
                  format={activeMetric.format}
                  axisFormat={metric === "gmv" || metric === "billingRevenue" ? moneyShort : num}
                />
              </div>
            </Panel>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Panel title="Top store" description="Highest paid GMV in period">
                {top && top.gmv > 0 ? (
                  <Link href={sellerHref(String(top.storeId))} className="block space-y-3 p-4 hover:bg-muted/40">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                        <Crown className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">{top.name}</p>
                        <p className="truncate text-[12px] text-muted-foreground">{top.domain}</p>
                      </div>
                      <Badge variant={badgeVariant(top.plan)} className="ml-auto">
                        {top.plan}
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      <MiniStat label="GMV" value={moneyShort(top.gmv)} />
                      <MiniStat label="Orders" value={num(top.orders)} />
                      <MiniStat label="Share" value={pct(top.gmv, c.gmv)} />
                    </dl>
                  </Link>
                ) : (
                  <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">No paid orders in this period</p>
                )}
              </Panel>

              <Panel
                title="Needs attention"
                actions={attentionCount ? <Badge variant="warning">{attentionCount}</Badge> : <Badge variant="success">all clear</Badge>}
              >
                <ul className="divide-y divide-border text-[13px]">
                  {data.attention.pendingVerification ? (
                    <AttentionRow
                      href={listHref("orders", { f: ["status:pending", "paymentStatus:pending", "paymentInfo.method:upi_manual"] }, false)}
                      label="UPI payments awaiting verification"
                      value={num(data.attention.pendingVerification)}
                    />
                  ) : null}
                  {data.attention.pendingReviews ? (
                    <AttentionRow href={listHref("reviews", { f: "status:pending" }, false)} label="Reviews pending" value={num(data.attention.pendingReviews)} />
                  ) : null}
                  {data.attention.pendingBilling.count ? (
                    <AttentionRow
                      href={listHref("billingorders", { f: "status:pending" }, false)}
                      label="Unfinished billing checkouts"
                      value={`${data.attention.pendingBilling.count} · ${money(data.attention.pendingBilling.amount)}`}
                    />
                  ) : null}
                  {data.subscriptions.list
                    .filter((s) => s.status === "past_due")
                    .map((s) => (
                      <AttentionRow key={String(s.storeId)} href={sellerHref(String(s.storeId))} label={`${s.name} · subscription past due`} value={s.plan} />
                    ))}
                  {data.attention.lowBalance.slice(0, 5).map((s) => (
                    <AttentionRow
                      key={String(s.storeId)}
                      href={sellerHref(String(s.storeId))}
                      label={`${s.name} · low credits`}
                      value={num(s.balance)}
                      danger={s.balance <= 0}
                    />
                  ))}
                  {data.attention.lowBalanceCount > 5 ? (
                    <AttentionRow
                      href="/smol/stores?sort=credits.balance&dir=asc"
                      label={`${num(data.attention.lowBalanceCount - 5)} more sellers low on credits`}
                      value="View"
                    />
                  ) : null}
                  {attentionCount === 0 ? <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">Nothing needs you right now</li> : null}
                </ul>
              </Panel>
            </div>
          </div>

          {/* Seller leaderboard */}
          <Panel
            title="Sellers"
            description={`${data.totalSellers > data.sellers.length ? `Top ${data.sellers.length} by GMV` : "Performance"} in the selected period · click a column to sort`}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/smol/stores">All sellers</Link>
              </Button>
            }
          >
            <div className="fd-scroll-thin overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[12px] text-muted-foreground">
                  <tr className="border-b border-border bg-surface-sunken/60">
                    <th className="px-4 py-2 font-medium">Seller</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    {SELLER_SORTS.map((col) => {
                      const active = sellerSort.key === col.key;
                      return (
                        <th
                          key={col.key}
                          className={cn("px-3 py-2 font-medium", col.numeric && "text-right")}
                          aria-sort={active ? (sellerSort.dir === 1 ? "ascending" : "descending") : undefined}
                        >
                          <button
                            type="button"
                            onClick={() => setSellerSort({ key: col.key, dir: active ? (sellerSort.dir === 1 ? -1 : 1) : -1 })}
                            className={cn("inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground", active && "text-foreground")}
                          >
                            {col.label}
                            {active ? sellerSort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sellers.map((s, index) => (
                    <tr key={String(s.storeId)} className="hover:bg-muted/50">
                      <td className="px-4 py-2">
                        <Link href={sellerHref(String(s.storeId))} className="flex items-center gap-2.5">
                          <span className="w-4 text-right text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:text-primary">{s.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              joined {fmtDate(s.joinedAt, "d MMM yy")}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={badgeVariant(s.plan)}>{s.plan}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(s.gmv)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Link href={listHref("orders", { storeId: String(s.storeId) })} className="hover:text-primary hover:underline">
                          {num(s.orders)}
                        </Link>
                        <span className="text-muted-foreground"> / {num(s.paidOrders)} paid</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(s.creditsUsed)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", s.balance <= SMOL_LOW_BALANCE && "font-medium text-warning", s.balance <= 0 && "text-destructive")}>
                        {num(s.balance)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {s.lastOrderAt ? formatDistanceToNow(new Date(s.lastOrderAt), { addSuffix: true }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Breakdowns */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Panel title="Plans" description="Sellers per plan, right now">
              <BarList
                rows={[...data.subscriptions.plans]
                  .sort((a, b) => SMOL_PLAN_ORDER.indexOf(a.plan) - SMOL_PLAN_ORDER.indexOf(b.plan))
                  .map((row) => ({
                    key: row.plan,
                    label: <Badge variant={badgeVariant(row.plan)}>{row.plan}</Badge>,
                    value: row.count,
                    href: listHref("stores", { f: `credits.plan:${row.plan}` }, false),
                  }))}
              />
            </Panel>
            <Panel title="Credit lots" description={`${num(creditLeft)} live credits by source`}>
              <div className="space-y-3 p-4">
                <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  {(["free", "plan", "pack"] as const).map((key, i) => (
                    <span
                      key={key}
                      className={cn("h-full", ["bg-primary/40", "bg-primary", "bg-warning"][i])}
                      style={{ width: pct(data.credits[key], creditLeft).replace("—", "0%") }}
                    />
                  ))}
                </div>
                <ul className="space-y-1.5 text-[13px]">
                  {([
                    ["free", "Free (signup / manual)", "bg-primary/40"],
                    ["plan", "Plan (expires each cycle)", "bg-primary"],
                    ["pack", "Packs (never expire)", "bg-warning"],
                  ] as const).map(([key, label, color]) => (
                    <li key={key} className="flex items-center gap-2">
                      <span className={cn("size-2.5 rounded-sm", color)} />
                      <span className="flex-1 text-muted-foreground">{label}</span>
                      <span className="tabular-nums">{num(data.credits[key])}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
            <Panel title="Credit usage" description="Consumed in period, by action">
              <BarList rows={data.usageByAction.map((row) => ({ key: row.action, label: row.action.replaceAll("_", " "), value: row.credits }))} />
            </Panel>
            <Panel title="Orders by status" description="Placed in period">
              <BarList
                rows={[
                  ...SMOL_ORDER_STATUSES,
                  ...data.byStatus.map((row) => row.status).filter((status) => !SMOL_ORDER_STATUSES.includes(status)),
                ].map((status) => ({
                  key: status,
                  label: <Badge variant={badgeVariant(status)}>{status}</Badge>,
                  value: data.byStatus.find((row) => row.status === status)?.count ?? 0,
                  href: listHref("orders", { f: `status:${status}` }),
                }))}
              />
            </Panel>
            <Panel title="Payment methods" description="Orders in period · paid GMV">
              <BarList
                format={(value) => num(value)}
                rows={data.byMethod.map((row) => ({
                  key: row.method,
                  label: (
                    <span>
                      {row.method.replaceAll("_", " ")} <span className="text-muted-foreground">· {money(row.gmv)}</span>
                    </span>
                  ),
                  value: row.count,
                  href: listHref("orders", { f: `paymentInfo.method:${row.method}` }),
                }))}
              />
            </Panel>
            <Panel title="Top products" description="By paid revenue in period">
              <BarList
                format={money}
                rows={data.topProducts.map((row) => ({
                  key: String(row.productId),
                  label: (
                    <span>
                      {String(row.name)} <span className="text-muted-foreground">· {storeName(String(row.storeId))} · ×{num(row.quantity)}</span>
                    </span>
                  ),
                  value: Number(row.revenue),
                }))}
              />
            </Panel>
          </div>

          {/* Activity */}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Panel
              title="Latest orders"
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/smol/orders">All orders</Link>
                </Button>
              }
            >
              <OrderList orders={data.recentOrders as Record<string, unknown>[]} />
            </Panel>
            <Panel
              title="Newest sellers"
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/smol/stores">All sellers</Link>
                </Button>
              }
            >
              <ul className="divide-y divide-border">
                {data.recentSellers.map((s) => (
                  <li key={String(s.storeId)}>
                    <Link href={sellerHref(String(s.storeId))} className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{s.domain}</span>
                      </span>
                      <Badge variant={badgeVariant(s.plan)}>{s.plan}</Badge>
                      <span className="w-20 text-right text-[12px] text-muted-foreground">
                        {s.joinedAt ? formatDistanceToNow(new Date(s.joinedAt), { addSuffix: true }) : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:[&:has(>:nth-child(5))]:grid-cols-5">{children}</div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-sunken px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-[14px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function AttentionRow({ href, label, value, danger }: { href: string; label: string; value: string; danger?: boolean }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2 px-4 py-2 hover:bg-muted/50">
        <AlertTriangle className={cn("size-3.5 shrink-0", danger ? "text-destructive" : "text-warning")} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </Link>
    </li>
  );
}

export function OrderList({ orders }: { orders: Record<string, unknown>[] }) {
  const { storeName, openRecord } = useSmol();
  if (orders.length === 0) return <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No orders yet</p>;
  return (
    <ul className="divide-y divide-border">
      {orders.map((order) => (
        <li key={String(order._id)}>
          <button
            type="button"
            onClick={() => openRecord("orders", String(order._id))}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1">
              <span className="font-medium">{String(order.orderNumber ?? "")}</span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {storeName(String(order.storeId))} · {String(getPath(order, "customerInfo.firstName") ?? "")}{" "}
                {String(getPath(order, "customerInfo.lastName") ?? "")} · {fmtDate(order.createdAt, "d MMM, HH:mm")}
              </span>
            </span>
            <Badge variant={badgeVariant(String(order.paymentStatus))} className="hidden sm:inline-flex">
              {String(order.paymentStatus)}
            </Badge>
            <Badge variant={badgeVariant(String(order.status))}>{String(order.status)}</Badge>
            <span className="w-16 text-right tabular-nums">{money(order.totalAmount)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
