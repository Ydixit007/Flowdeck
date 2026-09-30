import "server-only";
import { z } from "zod";
import { cached } from "@/lib/memo-cache";
import { bucketKeys, chartInterval, shiftDate, todayIST, type SmolInterval } from "@/lib/smol-config";

// Platform-wide PostHog analytics for the SmolBusiness admin. Read-only HogQL; only validated dates are interpolated.

const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 20_000;
const TZ = "Asia/Kolkata";

export const smolAnalyticsQuery = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    interval: z.enum(["auto", "day", "week", "month"]).default("auto"),
    dev: z.enum(["0", "1"]).default("0"),
    fresh: z.enum(["0", "1"]).default("0"),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from must be on or before to", path: ["from"] });
export type SmolAnalyticsQuery = z.infer<typeof smolAnalyticsQuery>;

type Row = Record<string, unknown>;

async function hog(sql: string): Promise<Row[]> {
  const { POSTHOG_HOST, POSTHOG_PROJECT_ID, POSTHOG_API_KEY } = process.env;
  const response = await fetch(`${POSTHOG_HOST ?? "https://eu.posthog.com"}/api/projects/${POSTHOG_PROJECT_ID}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${POSTHOG_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`PostHog query failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  const json = (await response.json()) as { results?: unknown[][]; columns?: string[] };
  const columns = json.columns ?? [];
  return (json.results ?? []).map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

const n = (value: unknown) => Number(value ?? 0) || 0;

// Mirrors smolBusiness-web lib/analytics/identity.ts: pageviews carry `surface`; every event carries `person_type`.
const HOST = "coalesce(properties.$host, '')";
const PATH = "coalesce(properties.$pathname, '')";
// Page surface: web tags it since 2026-09-02 ('marketing' = our 'landing'); URL rules cover older and custom events.
const PAGE_SURFACE = `multiIf(
  coalesce(properties.$current_url, '') LIKE '%preview=%', 'seller',
  properties.surface = 'marketing', 'landing',
  properties.surface IN ('seller', 'storefront'), properties.surface,
  startsWith(${PATH}, '/seller'), 'seller',
  startsWith(${PATH}, '/track') OR startsWith(${PATH}, '/store/'), 'storefront',
  ${HOST} IN ('smolbusiness.in', 'www.smolbusiness.in', 'localhost:3000'), 'landing',
  'storefront')`;
// person_type only upgrades, so a seller on their own shop or the marketing site is seller traffic, not a buyer or lead.
const IS_SELLER = "properties.person_type = 'seller'";
const SURFACE = `if(${IS_SELLER}, 'seller', ${PAGE_SURFACE})`;
const BUYER = `${SURFACE} != 'seller'`;
const DEV_TRAFFIC = `(${HOST} LIKE '%localhost%' OR ${HOST} LIKE '%.vercel.app' OR ${HOST} LIKE '%devtunnels.ms' OR match(${HOST}, '^[0-9.:]+$'))`;
// Retention identity: signed-up sellers by person property, else storefront buyers.
const WHO = `multiIf(person.properties.person_type = 'seller', 'seller', ${SURFACE} = 'storefront', 'storefront', '')`;
const ORDER_PURCHASE = "(event != 'purchase' OR isNull(properties.productId))"; // purchase also fires per product
// Sellers are identify()'d by storeId; seller_store_id is sometimes the string "undefined", so validate both.
const OBJECT_ID = "'^[0-9a-f]{24}$'";
const SELLER_STORE = `coalesce(
  nullIf(anyIf(properties.seller_store_id, match(coalesce(properties.seller_store_id, ''), ${OBJECT_ID})), ''),
  nullIf(anyIf(distinct_id, match(distinct_id, ${OBJECT_ID})), ''))`;

const at = (date: string) => `toDateTime('${date} 00:00:00', '${TZ}')`;
const ist = `toTimeZone(timestamp, '${TZ}')`;
function bucketSql(interval: SmolInterval) {
  if (interval === "month") return `formatDateTime(${ist}, '%Y-%m')`;
  if (interval === "week") return `formatDateTime(toStartOfWeek(${ist}, 1), '%Y-%m-%d')`;
  return `formatDateTime(${ist}, '%Y-%m-%d')`;
}

const DAY_MS = 86_400_000;
const CONCURRENCY = 3; // PostHog caps concurrent queries per project

// Event names from smolBusiness-web lib/analytics/events.ts.
const SELLER_FUNNEL = ["signup_clicked", "otp_requested", "signed_up", "store_created", "seller_product_created"] as const;
const BUYER_FUNNEL = ["store_visit", "product_view", "add_to_cart", "checkout_start", "purchase"] as const;
const SELLER_EVENTS = [
  ...SELLER_FUNNEL,
  "logged_in",
  "subscription_checkout_started",
  "subscription_started",
  "subscription_cancelled",
  "credit_topup_started",
  "credit_topup_completed",
] as const;
const BUYER_EVENTS = [...BUYER_FUNNEL, "cart_view", "remove_from_cart", "coupon_applied", "purchase_failed", "product_share", "product_reel_view"] as const;
const list = (events: readonly string[]) => events.map((e) => `'${e}'`).join(", ");

export function posthogConfigured(): boolean {
  return Boolean(process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID);
}

export function smolAnalytics(query: SmolAnalyticsQuery) {
  const key = `posthog:${query.from}:${query.to}:${query.interval}:${query.dev}`;
  return cached(key, TTL_MS, () => loadAnalytics(query), query.fresh === "1");
}

async function loadAnalytics(query: SmolAnalyticsQuery) {
  const to = query.to ?? todayIST();
  const compare = Boolean(query.from);
  const from = query.from ?? "2020-01-01";
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  const interval = chartInterval(days, query.interval);
  const prevFrom = shiftDate(from, -days);

  const prod = query.dev === "1" ? "1" : `NOT ${DEV_TRAFFIC}`;
  const window = `timestamp >= ${at(from)} AND timestamp < ${at(shiftDate(to, 1))}`;
  const where = (extra: string) => `WHERE ${prod} AND ${window} AND ${extra}`;

  const queries = {
    totals: `SELECT if(timestamp >= ${at(from)}, 'current', 'previous') AS win, ${SURFACE} AS surface,
        count() AS pageviews, uniq(person_id) AS visitors, uniq(properties.$session_id) AS sessions,
        uniqIf(person_id, ${IS_SELLER}) AS sellers
      FROM events WHERE event = '$pageview' AND ${prod}
        AND timestamp >= ${at(compare ? prevFrom : from)} AND timestamp < ${at(shiftDate(to, 1))}
      GROUP BY win, surface`,
    series: `SELECT ${bucketSql(interval)} AS key, ${SURFACE} AS surface, count() AS pageviews, uniq(person_id) AS visitors
      FROM events ${where("event = '$pageview'")} GROUP BY key, surface`,
    events: `SELECT event, count() AS count, uniq(person_id) AS people, uniq(properties.$session_id) AS sessions
      FROM events ${where(`event IN (${list([...SELLER_EVENTS, ...BUYER_EVENTS])})
        AND ${ORDER_PURCHASE} AND (event IN (${list(SELLER_EVENTS)}) OR ${BUYER})`)}
      GROUP BY event`,
    sellers: `SELECT storeId, sum(events) AS events, sum(sessions) AS sessions, sum(products) AS products, max(seen) AS lastSeen FROM (
        SELECT ${SELLER_STORE} AS storeId, count() AS events, uniq(properties.$session_id) AS sessions,
          countIf(event = 'seller_product_created') AS products, max(timestamp) AS seen
        FROM events ${where(IS_SELLER)} GROUP BY person_id)
      WHERE isNotNull(storeId) GROUP BY storeId ORDER BY sessions DESC LIMIT 25`,
    entryPages: `SELECT page, count() AS sessions FROM (
        SELECT properties.$session_id AS sid, argMin(${PATH}, timestamp) AS page
        FROM events ${where(`event = '$pageview' AND ${SURFACE} = 'landing'`)} GROUP BY sid)
      GROUP BY page ORDER BY sessions DESC LIMIT 12`,
    pages: `SELECT ${PATH} AS page, count() AS views, uniq(person_id) AS visitors
      FROM events ${where(`event = '$pageview' AND ${SURFACE} = 'landing'`)} GROUP BY page ORDER BY views DESC LIMIT 12`,
    channels: `SELECT ${SURFACE} AS surface,
        multiIf(coalesce(properties.utm_source, '') != '', lower(properties.utm_source),
          coalesce(properties.$referring_domain, '$direct') IN ('$direct', ''), 'direct',
          properties.$referring_domain LIKE '%smolbusiness.in', 'internal',
          replaceRegexpOne(properties.$referring_domain, '^(www|l|m|lm)\\\\.', '')) AS channel,
        uniq(properties.$session_id) AS sessions
      FROM events ${where("event = '$pageview'")} GROUP BY surface, channel ORDER BY sessions DESC LIMIT 60`,
    stores: `SELECT properties.store_id AS storeId, any(properties.store_name) AS name,
        uniq(person_id) AS visitors, uniqIf(properties.$session_id, event = 'store_visit') AS visits,
        countIf(event = 'product_view') AS productViews, countIf(event = 'add_to_cart') AS carts,
        countIf(event = 'checkout_start') AS checkouts, countIf(event = 'purchase') AS purchases,
        uniqIf(properties.$session_id, event = 'purchase') AS buyingSessions,
        sumIf(toFloat(properties.amount), event = 'purchase') AS revenue
      FROM events ${where(`isNotNull(properties.store_id) AND ${BUYER} AND ${ORDER_PURCHASE}
        AND event IN ('$pageview', ${list(BUYER_FUNNEL)})`)}
      GROUP BY storeId ORDER BY visitors DESC LIMIT 50`,
    tech: `SELECT 'device' AS kind, coalesce(properties.$device_type, 'Unknown') AS value, uniq(person_id) AS people
        FROM events ${where("event = '$pageview'")} GROUP BY value
      UNION ALL
      SELECT 'country' AS kind, coalesce(properties.$geoip_country_name, 'Unknown') AS value, uniq(person_id) AS people
        FROM events ${where("event = '$pageview'")} GROUP BY value`,
    vitals: `SELECT ${PAGE_SURFACE} AS surface, count() AS samples,
        quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) AS lcp,
        quantile(0.75)(toFloat(properties.$web_vitals_INP_value)) AS inp,
        quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)) AS cls,
        quantile(0.75)(toFloat(properties.$web_vitals_FCP_value)) AS fcp
      FROM events ${where("event = '$web_vitals'")} GROUP BY surface`,
    rage: `SELECT ${PAGE_SURFACE} AS surface, ${PATH} AS page, count() AS clicks
      FROM events ${where("event = '$rageclick'")} GROUP BY surface, page ORDER BY clicks DESC LIMIT 10`,
    // Cohort = first-ever visit week (full history, like PostHog); only the last 8 cohorts are shown.
    // ponytail: scans all pageviews; bound the inner query by a launch date if it gets slow.
    retention: `SELECT surface, cohort, dateDiff('week', cohort, week) AS offset, uniq(pid) AS people FROM (
        SELECT person_id AS pid, ${WHO} AS surface, toStartOfWeek(${ist}, 1) AS week,
          min(toStartOfWeek(${ist}, 1)) OVER (PARTITION BY person_id, ${WHO}) AS cohort
        FROM events WHERE event = '$pageview' AND ${prod})
      WHERE surface != '' AND cohort >= toStartOfWeek(now(), 1) - INTERVAL 7 WEEK
      GROUP BY surface, cohort, offset ORDER BY cohort, offset`,
  };

  const entries = Object.entries(queries) as [keyof typeof queries, string][];
  const results = {} as Record<keyof typeof queries, Row[]>;
  // Pool, not batches: a slow query no longer holds back the two slots beside it.
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let next = entries.shift(); next; next = entries.shift()) results[next[0]] = await hog(next[1]);
    }),
  );

  const totals = (win: string) =>
    Object.fromEntries(
      ["landing", "storefront", "seller"].map((surface) => {
        const row = results.totals.find((r) => r.win === win && r.surface === surface);
        return [surface, { pageviews: n(row?.pageviews), visitors: n(row?.visitors), sessions: n(row?.sessions), sellers: n(row?.sellers) }];
      }),
    ) as Record<"landing" | "storefront" | "seller", { pageviews: number; visitors: number; sessions: number; sellers: number }>;

  const seriesFrom = query.from ?? String(results.series.map((r) => r.key).sort()[0] ?? to).slice(0, 10);
  const series = new Map(
    bucketKeys(interval === "month" && seriesFrom.length === 7 ? `${seriesFrom}-01` : seriesFrom, to, interval).map((k) => [
      k,
      { key: k, landing: 0, storefront: 0, seller: 0, pageviews: 0 },
    ]),
  );
  for (const row of results.series) {
    const point = series.get(String(row.key));
    const surface = String(row.surface) as "landing" | "storefront" | "seller";
    if (!point) continue;
    point[surface] = n(row.visitors);
    point.pageviews += n(row.pageviews);
  }

  const events = Object.fromEntries(
    results.events.map((r) => [String(r.event), { count: n(r.count), people: n(r.people), sessions: n(r.sessions) }]),
  ) as Record<string, { count: number; people: number; sessions: number } | undefined>;
  const current = totals("current");
  const cohorts = new Map<string, { surface: string; cohort: string; size: number; weeks: number[] }>();
  for (const row of results.retention) {
    const id = `${row.surface}:${row.cohort}`;
    const entry = cohorts.get(id) ?? { surface: String(row.surface), cohort: String(row.cohort).slice(0, 10), size: 0, weeks: [] };
    const offset = n(row.offset);
    if (offset === 0) entry.size = n(row.people);
    entry.weeks[offset] = n(row.people);
    cohorts.set(id, entry);
  }

  return {
    generatedAt: new Date().toISOString(),
    range: { from: query.from ?? null, to, interval, compare, prevFrom: compare ? prevFrom : null, prevTo: compare ? shiftDate(from, -1) : null },
    current,
    previous: compare ? totals("previous") : null,
    series: [...series.values()],
    sellerFunnel: [
      { step: "landing_visit", people: current.landing.visitors },
      ...SELLER_FUNNEL.map((step) => ({ step, people: events[step]?.people ?? 0 })),
    ],
    buyerFunnel: BUYER_FUNNEL.map((step) => ({ step, sessions: events[step]?.sessions ?? 0 })),
    events: Object.fromEntries([...SELLER_EVENTS, ...BUYER_EVENTS].map((e) => [e, events[e] ?? { count: 0, people: 0, sessions: 0 }])),
    activeSellers: results.sellers.map((r) => ({
      storeId: String(r.storeId),
      events: n(r.events),
      sessions: n(r.sessions),
      products: n(r.products),
      lastSeen: String(r.lastSeen),
    })),
    entryPages: results.entryPages.map((r) => ({ page: String(r.page || "/"), sessions: n(r.sessions) })),
    pages: results.pages.map((r) => ({ page: String(r.page || "/"), views: n(r.views), visitors: n(r.visitors) })),
    channels: results.channels.map((r) => ({ surface: String(r.surface), channel: String(r.channel), sessions: n(r.sessions) })),
    stores: results.stores.map((r) => ({
      storeId: String(r.storeId),
      name: String(r.name ?? ""),
      visitors: n(r.visitors),
      visits: n(r.visits),
      productViews: n(r.productViews),
      carts: n(r.carts),
      checkouts: n(r.checkouts),
      purchases: n(r.purchases),
      buyingSessions: n(r.buyingSessions),
      revenue: n(r.revenue),
    })),
    devices: results.tech.filter((r) => r.kind === "device").map((r) => ({ value: String(r.value), people: n(r.people) })),
    countries: results.tech.filter((r) => r.kind === "country").map((r) => ({ value: String(r.value), people: n(r.people) })),
    vitals: results.vitals.map((r) => ({
      surface: String(r.surface),
      samples: n(r.samples),
      lcp: r.lcp == null ? null : n(r.lcp),
      inp: r.inp == null ? null : n(r.inp),
      cls: r.cls == null ? null : n(r.cls),
      fcp: r.fcp == null ? null : n(r.fcp),
    })),
    rage: results.rage.map((r) => ({ surface: String(r.surface), page: String(r.page), clicks: n(r.clicks) })),
    retention: [...cohorts.values()].map((c) => ({ ...c, weeks: Array.from({ length: c.weeks.length }, (_, i) => c.weeks[i] ?? 0) })),
  };
}
export type SmolAnalytics = Awaited<ReturnType<typeof loadAnalytics>>;
