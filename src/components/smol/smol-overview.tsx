"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import dynamic from "next/dynamic";
import { CheckCircle2, ChevronRight, RefreshCw, Store } from "lucide-react";
import { qs } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SMOL_ORDER_STATUSES, SMOL_PLAN_ORDER, periodRange } from "@/lib/smol-config";
import type { SmolIntel } from "@/server/smol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SubscriptionActivity } from "@/components/smol/subscription-activity";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import {
  BarList,
  Delta,
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

const TOP_SELLERS = 8;

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
  const [cohort, setCohort] = React.useState(true);
  const [stuck, setStuck] = React.useState<"noProducts" | "noOrders" | null>(null);
  const [activity, setActivity] = React.useState("orders");
  const [breakdown, setBreakdown] = React.useState("status");

  const { data, error, loading, reload } = useSmolFetch<SmolIntel>(`/api/smol/intel${qs({ from: range.from, to: range.to, interval })}`);

  // Drill-downs carry the same window into the list views.
  const periodParams = period === "all" ? {} : { period, from: url.get("from"), to: url.get("to") };
  const listHref = (name: string, extra: Record<string, string | string[]> = {}, windowed = true) =>
    `/smol/${name}${qs({ ...(windowed ? periodParams : {}), ...extra })}`;

  if (error && !data) return <EmptyState icon={<Store />} title="Could not load SmolBusiness" description={error} />;

  const c = data?.current;
  const p = data?.previous;
  const sub = data?.subscriptions;
  const out = data?.outcomes;
  const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
          <p className="text-[12px] text-muted-foreground">
            {data
              ? `${fmtDate(`${data.range.from}T00:00:00`, "d MMM")} – ${fmtDate(`${data.range.to}T00:00:00`, "d MMM yyyy")}${data.range.compare ? " · vs previous period" : ""}`
              : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker
            period={period}
            from={url.get("from")}
            to={url.get("to")}
            onChange={(next) => url.set({ period: next.period === "30d" ? null : next.period, from: next.from ?? null, to: next.to ?? null })}
          />
          <Button variant="outline" size="icon-sm" onClick={reload} aria-label="Refresh" title="Refresh">
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {!data || !c || !sub || !out ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <Skeleton className="h-64 xl:col-span-12" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 xl:col-span-3" />
          ))}
        </div>
      ) : (
        <div className={cn("grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-12", loading && "opacity-60")}>
          {/* North star: stores that actually sell */}
          <Bento
            className="sm:col-span-2 xl:col-span-12"
            title="Stores that made a sale"
            action={
              <Select value={interval} onChange={(event) => url.set({ interval: event.target.value === "auto" ? null : event.target.value })} aria-label="Group chart by">
                <option value="auto">Auto</option>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </Select>
            }
          >
            <div className="grid gap-4 px-4 pb-4 md:grid-cols-[200px_minmax(0,1fr)]">
              <div className="flex flex-col justify-center gap-2">
                <p className="flex items-baseline gap-2">
                  <Big>{num(out.sellingStores)}</Big>
                  <span className="text-[13px] text-muted-foreground">of {num(data.totalSellers)} stores</span>
                </p>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Delta current={out.sellingStores} previous={out.sellingStoresBefore} />
                  {pct(out.sellingStores, data.totalSellers)} of live stores
                </div>
              </div>
              <div className="h-48 min-w-0">
                <TrendChart data={data.series} dataKey="sellingStores" interval={data.range.interval} label="Stores that sold" format={num} axisFormat={num} bars />
              </div>
            </div>
          </Bento>

          {/* What drives it */}
          <Bento className="xl:col-span-3" title="Activation" action={<PointsChange now={rate(out.activation.sold, out.activation.joined)} before={out.activationBefore ? rate(out.activationBefore.sold, out.activationBefore.joined) : null} />}>
            <Metric
              value={pctText(rate(out.activation.sold, out.activation.joined))}
              bar={rate(out.activation.sold, out.activation.joined)}
              caption={`${num(out.activation.sold)} of ${num(out.activation.joined)} new sellers sold${out.activation.medianDays !== null ? ` · ~${out.activation.medianDays}d to first sale` : ""}`}
            />
          </Bento>
          <Bento className="xl:col-span-3" title="Seller retention">
            <Metric
              value={pctText(out.retention ? rate(out.retention.kept, out.retention.base) : null)}
              bar={out.retention ? rate(out.retention.kept, out.retention.base) : null}
              caption={out.retention ? `${num(out.retention.kept)} of ${num(out.retention.base)} kept selling` : "Pick a period to compare"}
            />
          </Bento>
          <Bento className="xl:col-span-3" title="Recurring revenue" action={<MoneyChange value={sub.period.netMrrChange} />}>
            <Metric value={money(sub.committedMrr)} unit="/mo" caption={`${num(sub.paid)} paying · ${num(sub.period.new)} new · ${num(sub.period.churned)} churned`} />
          </Bento>
          <Bento className="xl:col-span-3" title="Sales in stores" action={<Delta current={c.gmv} previous={p?.gmv} />}>
            <Metric value={money(c.gmv)} caption={`${num(c.paidOrders)} orders · avg ${money(c.paidOrders ? c.gmv / c.paidOrders : 0)}`} />
          </Bento>

          {/* Where the funnel leaks, and what needs a human */}
          <Bento
            className="sm:col-span-2 xl:col-span-8 xl:h-[260px]"
            title="Seller journey"
            action={<Segmented value={cohort ? "cohort" : "all"} onChange={(v) => setCohort(v === "cohort")} options={[["cohort", "Joined in period"], ["all", "All"]]} />}
          >
            <JourneySteps
              steps={cohort ? data.journey.cohort : data.journey.all}
              stuck={[
                null,
                data.journey.noProductsCount ? { label: `${num(data.journey.noProductsCount)} stuck`, open: () => setStuck("noProducts") } : null,
                data.journey.noOrdersCount ? { label: `${num(data.journey.noOrdersCount)} stuck`, open: () => setStuck("noOrders") } : null,
                null,
              ]}
            />
          </Bento>
          <Bento className="sm:col-span-2 xl:col-span-4 xl:h-[260px]" title="To do" action={<CountPill n={todo(data, listHref).length} />}>
            <TodoList items={todo(data, listHref)} />
          </Bento>

          {/* Who and what */}
          <Bento
            className="xl:col-span-4 xl:h-[380px]"
            title="Top sellers"
            action={
              <Link href="/smol/stores" className="text-[12px] text-muted-foreground hover:text-foreground">
                View all
              </Link>
            }
          >
            <ul className="text-[13px]">
              {data.sellers.slice(0, TOP_SELLERS).map((s, index) => (
                <li key={String(s.storeId)}>
                  <Link href={sellerHref(String(s.storeId))} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50">
                    <span className="w-3 text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {num(s.orders)} orders · {s.plan}
                      </span>
                    </span>
                    <span className="text-right font-medium tabular-nums">{money(s.gmv)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Bento>
          <Bento
            className="xl:col-span-4 xl:h-[380px]"
            title="Activity"
            action={
              <Select value={activity} onChange={(event) => setActivity(event.target.value)} aria-label="Activity">
                <option value="orders">Orders</option>
                <option value="sellers">New sellers</option>
                <option value="subs">Plan changes</option>
                <option value="renewals">Renewals</option>
              </Select>
            }
          >
            {activity === "orders" ? (
              <OrderList orders={data.recentOrders as Record<string, unknown>[]} />
            ) : activity === "sellers" ? (
              <SellerList rows={data.recentSellers} />
            ) : (
              <SubscriptionActivity compact rows={activity === "subs" ? sub.recent : sub.renewals} empty={activity === "subs" ? "No plan changes" : "No renewals"} />
            )}
          </Bento>
          <Bento
            className="sm:col-span-2 xl:col-span-4 xl:h-[380px]"
            title="Breakdown"
            action={
              <Select value={breakdown} onChange={(event) => setBreakdown(event.target.value)} aria-label="Breakdown">
                <option value="status">Order status</option>
                <option value="method">Payment method</option>
                <option value="products">Top products</option>
                <option value="plans">Plans</option>
                <option value="usage">Credit usage</option>
                <option value="lots">Credits left</option>
              </Select>
            }
          >
            {breakdown === "status" ? (
              <BarList
                rows={[...SMOL_ORDER_STATUSES, ...data.byStatus.map((row) => row.status).filter((status) => !SMOL_ORDER_STATUSES.includes(status))].map((status) => ({
                  key: status,
                  label: <span className="capitalize">{status}</span>,
                  value: data.byStatus.find((row) => row.status === status)?.count ?? 0,
                  href: listHref("orders", { f: `status:${status}` }),
                }))}
              />
            ) : breakdown === "method" ? (
              <BarList rows={data.byMethod.map((row) => ({ key: row.method, label: row.method.replaceAll("_", " "), value: row.count, href: listHref("orders", { f: `paymentInfo.method:${row.method}` }) }))} />
            ) : breakdown === "products" ? (
              <BarList
                format={money}
                rows={data.topProducts.map((row) => ({
                  key: String(row.productId),
                  label: (
                    <span>
                      {String(row.name)} <span className="text-muted-foreground">· {storeName(String(row.storeId))}</span>
                    </span>
                  ),
                  value: Number(row.revenue),
                }))}
              />
            ) : breakdown === "plans" ? (
              <BarList
                rows={[...sub.plans]
                  .sort((a, b) => SMOL_PLAN_ORDER.indexOf(a.plan) - SMOL_PLAN_ORDER.indexOf(b.plan))
                  .map((row) => ({ key: row.plan, label: <span className="capitalize">{row.plan}</span>, value: row.count, href: listHref("stores", { f: `credits.plan:${row.plan}` }, false) }))}
              />
            ) : breakdown === "usage" ? (
              <BarList rows={data.usageByAction.map((row) => ({ key: row.action, label: row.action.replaceAll("_", " "), value: row.credits }))} />
            ) : (
              <BarList
                empty="No live credits"
                rows={([
                  ["free", "Free"],
                  ["plan", "Plan"],
                  ["pack", "Packs"],
                ] as const).map(([key, label]) => ({ key, label, value: data.credits[key] }))}
              />
            )}
          </Bento>

          <Dialog open={!!stuck} onOpenChange={(open) => !open && setStuck(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{stuck === "noProducts" ? "No products yet" : "Products, no sale yet"}</DialogTitle>
                <DialogDescription>Joined more than 3 days ago, newest first.</DialogDescription>
              </DialogHeader>
              <div className="fd-scroll-thin max-h-[60vh] overflow-y-auto">
                <SellerList rows={stuck ? data.journey[stuck] : []} />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

/** One card style for the whole page: title row, then content that scrolls inside a fixed-height tile. */
function Bento({ title, action, className, children }: { title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("fd-panel flex min-w-0 flex-col overflow-hidden", className)}>
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</h3>
        {action}
      </header>
      <div className="fd-scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

const Big = ({ children }: { children: React.ReactNode }) => <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">{children}</span>;
const pctText = (value: number | null) => (value === null ? "—" : `${value}%`);

function Metric({ value, unit, bar, caption }: { value: string; unit?: string; bar?: number | null; caption: string }) {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4">
      <p className="flex items-baseline gap-1.5">
        <Big>{value}</Big>
        {unit ? <span className="text-[12px] text-muted-foreground">{unit}</span> : null}
      </p>
      {bar !== undefined ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${bar ?? 0}%` }} />
        </div>
      ) : null}
      <p className="mt-auto truncate text-[12px] text-muted-foreground">{caption}</p>
    </div>
  );
}

function Chip({ text, good }: { text: string; good: boolean | null }) {
  return (
    <span className={cn("rounded px-1 py-px text-[11px] font-medium tabular-nums", good === null ? "text-muted-foreground" : good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
      {text}
    </span>
  );
}

function PointsChange({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return null;
  const diff = now - before;
  return <Chip text={diff === 0 ? "no change" : `${diff > 0 ? "+" : ""}${diff} pts`} good={diff === 0 ? null : diff > 0} />;
}

function MoneyChange({ value }: { value: number }) {
  return <Chip text={value === 0 ? "no change" : `${value > 0 ? "+" : "−"}${moneyShort(Math.abs(value))}`} good={value === 0 ? null : value > 0} />;
}

function CountPill({ n }: { n: number }) {
  return n ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-warning">{n}</span> : null;
}

const STEP_LABELS = ["Signed up", "Added products", "Made a sale", "Paid plan"];

function JourneySteps({ steps, stuck }: { steps: number[]; stuck: ({ label: string; open: () => void } | null)[] }) {
  const base = steps[0] || 1;
  return (
    <ol className="grid h-full grid-cols-2 gap-x-6 gap-y-5 px-4 pb-4 pt-2 md:grid-cols-4">
      {steps.map((count, index) => {
        const hint = stuck[index];
        return (
          <li key={index} className="flex flex-col gap-2">
            <span className="text-[12px] text-muted-foreground">{STEP_LABELS[index]}</span>
            <Big>{num(count)}</Big>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${(count / base) * 100}%` }} />
            </div>
            <span className="flex items-center justify-between gap-2 text-[12px]">
              <span className="tabular-nums text-muted-foreground">{index ? pct(count, base) : "100%"}</span>
              {hint ? (
                <button type="button" onClick={hint.open} className="inline-flex items-center gap-0.5 text-warning hover:underline">
                  {hint.label} <ChevronRight className="size-3" />
                </button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <div role="group" className="flex items-center rounded-lg border border-border bg-surface-sunken p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn("h-6 rounded-md px-2 text-[11px] font-medium transition-colors", value === key ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type TodoItem = { label: string; value: string; href: string; tone: "danger" | "warning" | "info" };

function TodoList({ items }: { items: TodoItem[] }) {
  if (items.length === 0)
    return (
      <p className="flex h-full items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
        <CheckCircle2 className="size-4 text-success" /> All clear
      </p>
    );
  return (
    <ul className="text-[13px]">
      {items.map((item) => (
        <li key={item.label}>
          <Link href={item.href} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50">
            <span className={cn("size-1.5 shrink-0 rounded-full", item.tone === "danger" ? "bg-destructive" : item.tone === "warning" ? "bg-warning" : "bg-primary")} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="font-medium tabular-nums">{item.value}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Card = SmolIntel["recentSellers"][number];

function SellerList({ rows }: { rows: Card[] }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No sellers</p>;
  return (
    <ul className="text-[13px]">
      {rows.map((s) => (
        <li key={String(s.storeId)}>
          <Link href={sellerHref(String(s.storeId))} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name ?? s.domain}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {s.plan} · joined {s.joinedAt ? formatDistanceToNow(new Date(s.joinedAt), { addSuffix: true }) : "—"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Admin to-dos, most urgent first. */
function todo(data: SmolIntel, listHref: (name: string, extra?: Record<string, string | string[]>, windowed?: boolean) => string): TodoItem[] {
  const a = data.attention;
  const items: TodoItem[] = [];
  for (const s of data.subscriptions.list.filter((row) => row.status === "past_due")) {
    items.push({ label: `${s.name ?? "Seller"} past due`, value: s.plan, href: sellerHref(String(s.storeId)), tone: "danger" });
  }
  if (a.pendingVerification)
    items.push({
      label: "UPI to verify",
      value: num(a.pendingVerification),
      href: listHref("orders", { f: ["status:pending", "paymentStatus:pending", "paymentInfo.method:upi_manual"] }, false),
      tone: "warning",
    });
  if (a.lowBalanceCount) items.push({ label: "Low on credits", value: num(a.lowBalanceCount), href: "/smol/stores?sort=credits.balance&dir=asc", tone: "warning" });
  if (a.pendingBilling.count) items.push({ label: "Unfinished checkouts", value: num(a.pendingBilling.count), href: listHref("billingorders", { f: "status:pending" }, false), tone: "info" });
  if (a.pendingReviews) items.push({ label: "Reviews to approve", value: num(a.pendingReviews), href: listHref("reviews", { f: "status:pending" }, false), tone: "info" });
  for (const r of data.subscriptions.dueSoon) {
    items.push({ label: `${r.name ?? "Seller"} renews ${fmtDate(r.dueAt, "d MMM")}`, value: String(r.plan ?? ""), href: sellerHref(r.storeId), tone: "info" });
  }
  return items;
}

/** Latest orders, one line each: number, store and time, status, amount. */
export function OrderList({ orders }: { orders: Record<string, unknown>[] }) {
  const { storeName, openRecord } = useSmol();
  if (orders.length === 0) return <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No orders yet</p>;
  return (
    <ul className="text-[13px]">
      {orders.map((order) => (
        <li key={String(order._id)}>
          <button type="button" onClick={() => openRecord("orders", String(order._id))} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/50">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{String(order.orderNumber ?? "")}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {storeName(String(order.storeId))} · {fmtDate(order.createdAt, "d MMM, HH:mm")}
              </span>
            </span>
            <Badge variant={badgeVariant(String(order.status))}>{String(order.status)}</Badge>
            <span className="w-16 text-right font-medium tabular-nums">{money(order.totalAmount)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
