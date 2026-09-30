"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatDistanceToNow } from "date-fns";
import { BarChart3, Globe, LayoutDashboard, MousePointerClick, RefreshCw, Store, UserPlus } from "lucide-react";
import { qs } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { periodRange } from "@/lib/smol-config";
import type { SmolAnalytics } from "@/server/smol-posthog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { BarList, Delta, Kpi, Panel, PeriodPicker, Select, fmtDate, money, num, pct, sellerHref, useSmol, useSmolFetch, useUrlState } from "@/components/smol/smol-ui";

const TrendChart = dynamic(() => import("@/components/smol/trend-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

type Result = ({ configured: false } | ({ configured: true } & SmolAnalytics));

const METRICS = [
  { key: "landing", label: "Landing visitors" },
  { key: "storefront", label: "Storefront visitors" },
  { key: "seller", label: "Seller traffic" },
  { key: "pageviews", label: "Pageviews" },
] as const;

const STEP_LABELS: Record<string, string> = {
  landing_visit: "Visited landing site",
  signup_clicked: "Clicked sign up",
  otp_requested: "Requested OTP",
  signed_up: "Signed up",
  store_created: "Created store",
  seller_product_created: "Added a product",
  store_visit: "Visited a store",
  product_view: "Viewed a product",
  add_to_cart: "Added to cart",
  checkout_start: "Started checkout",
  purchase: "Purchased",
};

const SELLER_ACTIVITY = {
  seller_product_created: "Products added",
  logged_in: "Logins",
  subscription_checkout_started: "Plan checkout started",
  subscription_started: "Plan started",
  subscription_cancelled: "Plan cancelled",
  credit_topup_started: "Credit top-up started",
  credit_topup_completed: "Credit top-up completed",
};
const SHOPPER_ACTIVITY = {
  cart_view: "Viewed cart",
  remove_from_cart: "Removed from cart",
  coupon_applied: "Applied coupon",
  purchase_failed: "Payment failed",
  product_share: "Shared a product",
  product_reel_view: "Watched a reel",
};

// Google's thresholds: [good, poor]; p75 at or under good is green, over poor is red.
const VITALS = [
  { key: "lcp", label: "LCP", good: 2500, poor: 4000, unit: "ms" },
  { key: "inp", label: "INP", good: 200, poor: 500, unit: "ms" },
  { key: "cls", label: "CLS", good: 0.1, poor: 0.25, unit: "" },
  { key: "fcp", label: "FCP", good: 1800, poor: 3000, unit: "ms" },
] as const;

export function SmolAnalyticsView() {
  const url = useUrlState();
  const { meta } = useSmol();
  const period = url.get("period") || "30d";
  const range = periodRange(period, { from: url.get("from"), to: url.get("to") });
  const interval = url.get("interval") || "auto";
  const dev = url.get("dev") === "1";
  const [metric, setMetric] = React.useState<(typeof METRICS)[number]["key"]>("landing");
  const { data: result, error, loading, reload } = useSmolFetch<Result>(
    `/api/smol/analytics${qs({ from: range.from, to: range.to, interval, dev: dev ? "1" : null })}`,
  );
  const storeNames = new Map((meta?.stores ?? []).map((store) => [store.id, store.name]));

  if (result && !result.configured) {
    return (
      <EmptyState
        icon={<BarChart3 />}
        title="PostHog is not connected"
        description="Set POSTHOG_PROJECT_ID, POSTHOG_API_KEY (personal key with query read access) and POSTHOG_HOST in .env, then restart."
      />
    );
  }
  const data = result?.configured ? result : null;
  const c = data?.current;
  const p = data?.previous;
  const funnelEvent = (step: string) => data?.sellerFunnel.find((row) => row.step === step)?.people ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Web & product analytics</h2>
          <p className="text-[12px] text-muted-foreground">
            PostHog{data ? ` · updated ${formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}` : ""} · cached 5 min
            {dev ? " · including dev traffic" : " · localhost & preview hosts excluded"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker
            period={period}
            from={url.get("from")}
            to={url.get("to")}
            onChange={(next) => url.set({ period: next.period === "30d" ? null : next.period, from: next.from ?? null, to: next.to ?? null })}
          />
          <Select value={interval} onChange={(event) => url.set({ interval: event.target.value === "auto" ? null : event.target.value })} aria-label="Group chart by">
            <option value="auto">Auto</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </Select>
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground">
            <input type="checkbox" checked={dev} onChange={(event) => url.set({ dev: event.target.checked ? "1" : null })} className="accent-[var(--primary)]" />
            Dev traffic
          </label>
          <Button variant="outline" size="icon-sm" onClick={reload} aria-label="Refresh from PostHog">
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && !data ? <EmptyState icon={<BarChart3 />} title="Could not load PostHog data" description={error} /> : null}
      {error && data ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">Refresh failed: {error}</p> : null}

      {!data || !c ? (
        !error ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-[92px]" />
            ))}
          </div>
        ) : null
      ) : (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={<Globe />}
              label="Landing visitors"
              value={num(c.landing.visitors)}
              delta={<Delta current={c.landing.visitors} previous={p?.landing.visitors} />}
              hint={`${num(c.landing.pageviews)} pageviews · ${num(c.landing.sessions)} sessions`}
            />
            <Kpi
              icon={<Store />}
              label="Storefront visitors"
              value={num(c.storefront.visitors)}
              delta={<Delta current={c.storefront.visitors} previous={p?.storefront.visitors} />}
              hint={`${num(c.storefront.pageviews)} pageviews · ${num(c.storefront.sessions)} sessions`}
            />
            <Kpi
              icon={<LayoutDashboard />}
              label="Active sellers"
              value={num(c.seller.sellers)}
              delta={<Delta current={c.seller.sellers} previous={p?.seller.sellers} />}
              hint={`${num(c.seller.visitors - c.seller.sellers)} prospects on login/onboarding · ${num(c.seller.sessions)} sessions`}
            />
            <Kpi
              icon={<UserPlus />}
              label="Seller signups"
              value={num(funnelEvent("signed_up"))}
              hint={`${num(funnelEvent("store_created"))} stores created · ${pct(funnelEvent("signed_up"), c.landing.visitors)} of landing visitors`}
            />
          </div>

          <Panel
            title="Traffic"
            description={`Unique visitors per ${data.range.interval}`}
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
                label={METRICS.find((m) => m.key === metric)!.label}
                format={num}
                axisFormat={num}
              />
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Seller acquisition funnel" description="Unique people reaching each step in the period">
              <Funnel steps={data.sellerFunnel.map((row) => ({ step: row.step, value: row.people }))} />
            </Panel>
            <Panel title="Buyer funnel" description="Sessions across all storefronts · signed-in sellers & previews excluded">
              <Funnel steps={data.buyerFunnel.map((row) => ({ step: row.step, value: row.sessions }))} />
            </Panel>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Panel title="Landing pages" description="Where marketing-site sessions start">
              <BarList rows={data.entryPages.map((row) => ({ key: row.page, label: <span className="font-mono text-[12px]">{row.page}</span>, value: row.sessions }))} />
            </Panel>
            <Panel title="Seller acquisition channels" description="Marketing-site sessions by source">
              <BarList rows={channelRows(data.channels, "landing")} />
            </Panel>
            <Panel title="Customer channels" description="Storefront sessions by source">
              <BarList rows={channelRows(data.channels, "storefront")} />
            </Panel>
          </div>

          <Panel title="Storefronts" description="Buyer behaviour per store · conversion = buying sessions ÷ store visits">
            <div className="fd-scroll-thin overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[12px] text-muted-foreground">
                  <tr className="border-b border-border bg-surface-sunken/60">
                    {["Store", "Visitors", "Visits", "Product views", "Add to cart", "Checkouts", "Purchases", "Conversion", "Revenue"].map((label, i) => (
                      <th key={label} className={cn("px-3 py-2 font-medium", i > 0 && "text-right")}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.stores.map((s) => (
                    <tr key={s.storeId} className="hover:bg-muted/50">
                      <td className="px-3 py-2 font-medium">
                        {storeNames.has(s.storeId) ? (
                          <Link href={sellerHref(s.storeId)} className="hover:text-primary hover:underline">
                            {s.name || s.storeId}
                          </Link>
                        ) : (
                          s.name || s.storeId
                        )}
                      </td>
                      {[s.visitors, s.visits, s.productViews, s.carts, s.checkouts, s.purchases].map((value, i) => (
                        <td key={i} className="px-3 py-2 text-right tabular-nums">
                          {num(value)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums">{pct(s.buyingSessions, s.visits)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.stores.length === 0 ? <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No storefront activity in this period</p> : null}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Seller activity" description="Events in the period · people">
              <EventList events={data.events} keys={SELLER_ACTIVITY} />
            </Panel>
            <Panel title="Shopper behaviour" description="Events in the period · people">
              <EventList events={data.events} keys={SHOPPER_ACTIVITY} />
              <p className="px-4 pb-3 text-[12px] text-muted-foreground">
                Payment failures hit {pct(data.events.purchase_failed?.sessions ?? 0, data.events.checkout_start?.sessions ?? 0)} of checkout sessions
              </p>
            </Panel>
          </div>

          <Panel title="Most active sellers" description="Signed-in sellers by sessions · from PostHog identify (storeId)">
            <div className="fd-scroll-thin overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[12px] text-muted-foreground">
                  <tr className="border-b border-border bg-surface-sunken/60">
                    {["Store", "Sessions", "Events", "Products added", "Last seen"].map((label, i) => (
                      <th key={label} className={cn("px-3 py-2 font-medium", i > 0 && "text-right")}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.activeSellers.map((s) => (
                    <tr key={s.storeId} className="hover:bg-muted/50">
                      <td className="px-3 py-2 font-medium">
                        {storeNames.has(s.storeId) ? (
                          <Link href={sellerHref(s.storeId)} className="hover:text-primary hover:underline">
                            {storeNames.get(s.storeId)}
                          </Link>
                        ) : (
                          <span className="font-mono text-[12px] text-muted-foreground">{s.storeId}</span>
                        )}
                      </td>
                      {[s.sessions, s.events, s.products].map((value, i) => (
                        <td key={i} className="px-3 py-2 text-right tabular-nums">
                          {num(value)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatDistanceToNow(new Date(s.lastSeen), { addSuffix: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.activeSellers.length === 0 ? <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">No seller activity in this period</p> : null}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Seller retention" description="Signed-up sellers by first-visit week, returning to any page · last 8 cohorts">
              <Retention rows={data.retention.filter((r) => r.surface === "seller")} />
            </Panel>
            <Panel title="Customer retention" description="Storefront visitors by first-visit week, returning to any storefront · last 8 cohorts">
              <Retention rows={data.retention.filter((r) => r.surface === "storefront")} />
            </Panel>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Panel title="Devices" description="Unique visitors">
              <BarList rows={data.devices.map((row) => ({ key: row.value, label: row.value, value: row.people }))} />
            </Panel>
            <Panel title="Countries" description="Unique visitors">
              <BarList rows={data.countries.slice(0, 8).map((row) => ({ key: row.value, label: row.value, value: row.people }))} />
            </Panel>
            <Panel title="Top landing-site pages" description="Views · visitors">
              <BarList
                rows={data.pages.slice(0, 8).map((row) => ({
                  key: row.page,
                  label: (
                    <span className="font-mono text-[12px]">
                      {row.page} <span className="font-sans text-muted-foreground">· {num(row.visitors)}</span>
                    </span>
                  ),
                  value: row.views,
                }))}
              />
            </Panel>
            <Panel title="Rage clicks" description="Pages where people click in frustration">
              <BarList
                empty="No rage clicks in this period"
                rows={data.rage.map((row) => ({
                  key: `${row.surface}${row.page}`,
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <MousePointerClick className="size-3 text-warning" />
                      <span className="font-mono text-[12px]">{row.page}</span>
                      <span className="text-muted-foreground">· {row.surface}</span>
                    </span>
                  ),
                  value: row.clicks,
                }))}
              />
            </Panel>
          </div>

          <Panel title="Web vitals" description="75th percentile per surface · green is good, red is poor">
            <div className="fd-scroll-thin overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[12px] text-muted-foreground">
                  <tr className="border-b border-border bg-surface-sunken/60">
                    <th className="px-4 py-2 font-medium">Surface</th>
                    {VITALS.map((v) => (
                      <th key={v.key} className="px-3 py-2 text-right font-medium">
                        {v.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Samples</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.vitals.map((row) => (
                    <tr key={row.surface}>
                      <td className="px-4 py-2 font-medium capitalize">{row.surface}</td>
                      {VITALS.map((v) => {
                        const value = row[v.key];
                        const tone = value === null ? "outline" : value <= v.good ? "success" : value > v.poor ? "danger" : "warning";
                        return (
                          <td key={v.key} className="px-3 py-2 text-right">
                            <Badge variant={tone}>{value === null ? "—" : v.unit ? `${num(Math.round(value))} ${v.unit}` : value.toFixed(3)}</Badge>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{num(row.samples)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function channelRows(channels: SmolAnalytics["channels"], surface: string) {
  return channels
    .filter((row) => row.surface === surface)
    .slice(0, 8)
    .map((row) => ({ key: row.channel, label: row.channel, value: row.sessions }));
}

function EventList({ events, keys }: { events: SmolAnalytics["events"]; keys: Record<string, string> }) {
  return (
    <BarList
      rows={Object.entries(keys).map(([event, label]) => ({
        key: event,
        label: (
          <span>
            {label} <span className="text-muted-foreground">· {num(events[event]?.people ?? 0)}</span>
          </span>
        ),
        value: events[event]?.count ?? 0,
      }))}
    />
  );
}

function Funnel({ steps }: { steps: { step: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="space-y-1.5 p-3">
      {steps.map((row, i) => {
        const prev = i > 0 ? (steps[i - 1]?.value ?? 0) : null;
        return (
          <li key={row.step} className="relative flex items-center gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-[13px]">
            <span className="absolute inset-y-0 left-0 rounded-md bg-primary/12" style={{ width: `${Math.min(100, (row.value / top) * 100)}%` }} aria-hidden />
            <span className="relative w-4 text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="relative flex-1 truncate">{STEP_LABELS[row.step] ?? row.step}</span>
            {prev !== null ? <span className="relative text-[11px] tabular-nums text-muted-foreground">{pct(row.value, prev)} of prev</span> : null}
            <span className="relative w-12 text-right font-medium tabular-nums">{num(row.value)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Retention({ rows }: { rows: SmolAnalytics["retention"] }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">Not enough returning visitors yet</p>;
  const weeks = Math.max(...rows.map((r) => r.weeks.length));
  return (
    <div className="fd-scroll-thin overflow-x-auto p-3">
      <table className="w-full text-[12px] tabular-nums">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Cohort</th>
            <th className="px-2 py-1 text-right font-medium">People</th>
            {Array.from({ length: weeks }, (_, i) => (
              <th key={i} className="px-1 py-1 text-center font-medium">
                W{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cohort}>
              <td className="whitespace-nowrap px-2 py-1">{fmtDate(`${row.cohort}T00:00:00`, "d MMM")}</td>
              <td className="px-2 py-1 text-right">{num(row.size)}</td>
              {Array.from({ length: weeks }, (_, i) => {
                const share = row.size ? (row.weeks[i] ?? 0) / row.size : 0;
                return (
                  <td key={i} className="p-0.5">
                    {i < row.weeks.length ? (
                      <span
                        className="block rounded px-1 py-1 text-center"
                        style={{ background: `color-mix(in oklab, var(--primary) ${Math.round(share * 70)}%, transparent)` }}
                        title={`${row.weeks[i] ?? 0} of ${row.size}`}
                      >
                        {Math.round(share * 100)}%
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
