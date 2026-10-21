import "server-only";
import mongoose from "mongoose";
import { z } from "zod";
import { ForbiddenError, NotFoundError, requireUser, type AuthUser } from "@/lib/auth";
import { smolDb } from "@/lib/smol-db";
import { cached } from "@/lib/memo-cache";
import {
  SMOL_COLLECTIONS,
  SMOL_LOW_BALANCE,
  SMOL_ORDER_STATUSES,
  SMOL_PLAN_PRICES,
  bucketKeys,
  chartInterval,
  type SmolCollectionName,
  type SmolInterval,
} from "@/lib/smol-config";

const { ObjectId } = mongoose.mongo;
type Filter = mongoose.mongo.Filter<mongoose.mongo.Document>;

// Read-only by design: the only writes live in smol-admin.ts.

const SENSITIVE_KEY = /secret|password|hash|token|enc$|^otp$/i;

export function isSmolAdmin(user: Pick<AuthUser, "email">): boolean {
  const allowed = (process.env.SMOL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email.toLowerCase());
}

export async function requireSmolAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!isSmolAdmin(user)) throw new ForbiddenError("SmolBusiness admin access required");
  return user;
}

/** ObjectIds → hex, Dates → ISO, secrets masked. OTP codes are masked too. */
function toPlain<T>(value: T, collection?: string): T {
  return JSON.parse(
    JSON.stringify(value, (key, v) =>
      SENSITIVE_KEY.test(key) || (collection === "otps" && key === "code") ? "••••" : v,
    ),
  ) as T;
}

const IST = "Asia/Kolkata";
const dayStart = (date: string) => new Date(`${date}T00:00:00.000+05:30`);
const dayEnd = (date: string) => new Date(`${date}T23:59:59.999+05:30`);
const istDate = (date: Date) => new Date(date.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isObjectId = (text: string) => /^[a-f\d]{24}$/i.test(text);

/** Filter values arrive as strings; match the string form and its bool/number/ObjectId twin. */
function looseValue(raw: string): unknown {
  if (raw === "(empty)") return { $in: [null, ""] };
  const variants: unknown[] = [raw];
  if (raw === "true" || raw === "false") variants.push(raw === "true");
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) variants.push(Number(raw));
  if (isObjectId(raw)) variants.push(new ObjectId(raw));
  return { $in: variants };
}

// A pending order whose reserved stock was released (checkout expired) is an abandoned cart, not an order.
const ABANDONED = { status: "pending", stockReleased: true };
const NOT_ABANDONED = { $nor: [ABANDONED] };
const isAbandoned = { $and: [{ $eq: ["$status", "pending"] }, { $eq: ["$stockReleased", true] }] };

/** Shows abandoned carts as such instead of "pending"; mutates rows fetched with `stockReleased`. */
function markAbandoned<T extends mongoose.mongo.Document[]>(rows: T): T {
  for (const row of rows) if (row.status === "pending" && row.stockReleased === true) row.status = "abandoned";
  return rows;
}

/** Orders get a virtual "abandoned" status; plain "pending" then means live pending orders only. */
function filterClause(name: SmolCollectionName, field: string, raw: string): Filter {
  if (name === "orders" && field === "status" && raw === "abandoned") return ABANDONED;
  if (name === "orders" && field === "status" && raw === "pending") return { status: "pending", stockReleased: { $ne: true } };
  // Missing resolvedAt (pre-feature docs) counts as open.
  if (field === "resolvedAt") return { resolvedAt: raw === "resolved" ? { $ne: null } : null };
  return { [field]: looseValue(raw) };
}

export const smolListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  sort: z.string().max(80).optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  storeId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Extra exact-match filters as "field:value", restricted to the collection's declared filters. */
  f: z.union([z.string(), z.array(z.string()).max(20)]).optional(),
  /** Customer drill-down: orders placed with this phone. */
  phone: z.string().max(20).optional(),
});
export type SmolListQuery = z.infer<typeof smolListQuery>;

export async function listSmol(name: SmolCollectionName, query: SmolListQuery) {
  const def = SMOL_COLLECTIONS[name];
  const db = await smolDb();
  const col = db.collection(name);

  const and: Filter[] = [];
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), "i");
    const or: Filter[] = def.search.map((field) => ({ [field]: rx }));
    if (isObjectId(query.q)) or.push({ _id: new ObjectId(query.q) });
    and.push({ $or: or });
  }
  if (query.storeId && "storeScoped" in def) and.push({ storeId: new ObjectId(query.storeId) });
  if (query.phone && name === "orders") and.push({ "customerInfo.phone": query.phone });

  const allowedFilters = new Set<string>(def.filters.map((filter) => filter.key));
  for (const pair of [query.f ?? []].flat()) {
    const at = pair.indexOf(":");
    const field = pair.slice(0, at);
    if (at > 0 && allowedFilters.has(field)) and.push(filterClause(name, field, pair.slice(at + 1)));
  }
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = dayStart(query.from);
    if (query.to) range.$lte = dayEnd(query.to);
    and.push({ createdAt: range });
  }
  const filter: Filter = and.length ? { $and: and } : {};

  const sortable = new Set<string>(def.columns.map((column) => column.key));
  const sortKey = query.sort && sortable.has(query.sort) ? query.sort : def.defaultSort;
  const projection = Object.fromEntries(def.columns.map((column) => [column.key, 1]));
  if (name === "orders") projection.stockReleased = 1;

  const [rows, total] = await Promise.all([
    col
      .find(filter, { projection })
      .sort({ [sortKey]: query.dir === "asc" ? 1 : -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .toArray(),
    col.countDocuments(filter),
  ]);

  return { rows: toPlain(name === "orders" ? markAbandoned(rows) : rows, name), total, page: query.page, limit: query.limit, sort: sortKey, dir: query.dir };
}

/** Dropdown options per declared filter, cached 5 min (the client also caches per session). */
export function smolFilterOptions(name: SmolCollectionName) {
  return cached(`options:${name}`, 5 * 60_000, () => loadFilterOptions(name));
}

async function loadFilterOptions(name: SmolCollectionName) {
  const def = SMOL_COLLECTIONS[name];
  const col = (await smolDb()).collection(name);
  const entries = await Promise.all(
    def.filters.map(async ({ key }) => {
      if (name === "orders" && key === "status") return [key, SMOL_ORDER_STATUSES] as const;
      if (key === "resolvedAt") return [key, ["open", "resolved"]] as const;
      const values = await col.distinct(key);
      const options = values
        .filter((v) => v !== null && v !== "" && typeof v !== "object")
        .map(String)
        .sort()
        .slice(0, 100);
      return [key, options] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function getSmolDoc(name: SmolCollectionName, id: string) {
  if (!isObjectId(id)) throw new NotFoundError("Record not found");
  const db = await smolDb();
  const doc = await db.collection(name).findOne({ _id: new ObjectId(id) });
  if (!doc) throw new NotFoundError("Record not found");

  // Seller: how much of everything they own. Customer: their orders.
  let related: Record<string, unknown> | null = null;
  if (name === "stores") {
    const scoped = Object.entries(SMOL_COLLECTIONS)
      .filter(([, def]) => "storeScoped" in def)
      .map(([key]) => key);
    const counts = await Promise.all(scoped.map((key) => db.collection(key).countDocuments({ storeId: doc._id })));
    const [revenue, usage] = await Promise.all([
      db
        .collection("orders")
        .aggregate([
          { $match: { storeId: doc._id } },
          {
            $group: {
              _id: null,
              total: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalAmount", 0] } },
              count: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] } },
              lastOrderAt: { $max: "$createdAt" },
            },
          },
        ])
        .next(),
      db
        .collection("credittransactions")
        .aggregate([
          { $match: { storeId: doc._id } },
          {
            $group: {
              _id: null,
              used: { $sum: { $cond: [{ $lt: ["$amount", 0] }, { $multiply: ["$amount", -1] }, 0] } },
              granted: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } },
            },
          },
        ])
        .next(),
    ]);
    related = {
      counts: Object.fromEntries(scoped.map((key, index) => [key, counts[index]])),
      paidRevenue: revenue?.total ?? 0,
      paidOrders: revenue?.count ?? 0,
      lastOrderAt: revenue?.lastOrderAt ?? null,
      creditsUsed: usage?.used ?? 0,
      creditsGranted: usage?.granted ?? 0,
    };
  } else if (name === "customers" && doc.phone) {
    const orders = await db
      .collection("orders")
      .find({ storeId: doc.storeId, "customerInfo.phone": doc.phone })
      .project({ orderNumber: 1, totalAmount: 1, status: 1, paymentStatus: 1, stockReleased: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    related = { orders: markAbandoned(orders) };
  }

  return { doc: toPlain(doc, name), related: toPlain(related) };
}

/** Sidebar counts + seller names, loaded once per shell mount and cached 60s. */
export function smolMeta() {
  return cached("meta", 60_000, loadMeta);
}

async function loadMeta() {
  const db = await smolDb();
  const names = Object.keys(SMOL_COLLECTIONS) as SmolCollectionName[];
  const [counts, stores] = await Promise.all([
    Promise.all(names.map((name) => db.collection(name).estimatedDocumentCount())),
    db.collection("stores").find({}, { projection: { storeName: 1, domain: 1 } }).sort({ storeName: 1 }).toArray(),
  ]);
  return toPlain({
    counts: Object.fromEntries(names.map((name, index) => [name, counts[index]])),
    stores: stores.map((store) => ({ id: store._id, name: store.storeName ?? store.domain ?? "Unnamed", domain: store.domain ?? "" })),
  });
}

export const smolIntelQuery = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    interval: z.enum(["auto", "day", "week", "month"]).default("auto"),
    /** "1" bypasses the cache (refresh button). */
    fresh: z.enum(["0", "1"]).default("0"),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from must be on or before to", path: ["from"] });
export type SmolIntelQuery = z.infer<typeof smolIntelQuery>;

const DAY_MS = 86_400_000;

/** Mongo expression producing the same keys as bucketOf. */
function bucketExpr(field: string, interval: SmolInterval) {
  if (interval === "month") return { $dateToString: { date: field, format: "%Y-%m", timezone: IST } };
  const date =
    interval === "week" ? { $dateTrunc: { date: field, unit: "week", startOfWeek: "monday", timezone: IST } } : field;
  return { $dateToString: { date, format: "%Y-%m-%d", timezone: IST } };
}

type Doc = mongoose.mongo.Document;
const num = (value: unknown) => (typeof value === "number" ? value : 0);

const INTEL_TTL_MS = 60_000;
const LEADERBOARD = 50;
const LIVE_STORE = { status: { $ne: "deleted" } };
const STORE_CARD = { storeName: 1, domain: 1, status: 1, createdAt: 1, "credits.plan": 1, "credits.balance": 1 };

/** Period intel (inclusive IST dates) vs the previous equal window, cached briefly per query. */
export function smolIntel({ fresh, ...query }: SmolIntelQuery) {
  return cached(`intel:${JSON.stringify(query)}`, INTEL_TTL_MS, () => loadIntel(query), fresh === "1");
}

async function loadIntel(query: Omit<SmolIntelQuery, "fresh">) {
  const db = await smolDb();
  const stores = db.collection("stores");
  const now = new Date();

  const to = query.to ?? istDate(now);
  const first = query.from ? null : await stores.find(LIVE_STORE, { projection: { createdAt: 1 } }).sort({ createdAt: 1 }).limit(1).next();
  const from = query.from ?? istDate(first?.createdAt ?? now);
  const start = dayStart(from);
  const end = dayEnd(to);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const interval = chartInterval(days, query.interval);
  const compare = Boolean(query.from);
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start.getTime() - days * DAY_MS);

  // One $facet aggregate per collection: a handful of round trips instead of dozens.
  const window = (a: Date, b: Date) => ({ createdAt: { $gte: a, $lte: b } });
  const scan = { $match: window(compare ? prevStart : start, end) };
  const cur = { $match: window(start, end) };
  const prev = { $match: window(prevStart, prevEnd) };
  const live = { $match: NOT_ABANDONED };
  const spentOnly = { $match: { amount: { $lt: 0 } } };
  const paidOnly = { $match: { status: "paid" } };
  const isPaid = { $eq: ["$paymentStatus", "paid"] };
  const spent = { $multiply: ["$amount", -1] };
  const bucket = bucketExpr("$createdAt", interval);

  const orderTotals = [
    {
      $group: {
        _id: null,
        orders: { $sum: { $cond: [isAbandoned, 0, 1] } },
        abandoned: { $sum: { $cond: [isAbandoned, 1, 0] } },
        paidOrders: { $sum: { $cond: [isPaid, 1, 0] } },
        gmv: { $sum: { $cond: [isPaid, "$totalAmount", 0] } },
        cod: { $sum: { $cond: [{ $and: [{ $eq: ["$paymentInfo.method", "cod"] }, { $not: [isAbandoned] }] }, 1, 0] } },
        sellers: { $addToSet: { $cond: [isAbandoned, "$$REMOVE", "$storeId"] } },
      },
    },
    { $set: { activeSellers: { $size: "$sellers" } } },
  ];
  const creditTotals = [
    {
      $group: {
        _id: null,
        used: { $sum: { $cond: [{ $lt: ["$amount", 0] }, spent, 0] } },
        granted: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } },
      },
    },
  ];
  const billingTotals = [
    paidOnly,
    {
      $group: {
        _id: null,
        revenue: { $sum: "$amount" },
        credits: { $sum: "$creditsToGrant" },
        purchases: { $sum: 1 },
        packRevenue: { $sum: { $cond: [{ $eq: ["$kind", "pack"] }, "$amount", 0] } },
        subscriptionRevenue: { $sum: { $cond: [{ $eq: ["$kind", "subscription"] }, "$amount", 0] } },
      },
    },
  ];

  const soon = new Date(now.getTime() + 7 * DAY_MS);
  const unlimitedNow = { "unlimited.enabled": true, $or: [{ "unlimited.until": null }, { "unlimited.until": { $gt: now } }] };
  const lowBalance = { $match: { "credits.balance": { $lte: SMOL_LOW_BALANCE }, $nor: [unlimitedNow] } };
  const expiresAt = { $ifNull: ["$expiresAt", null] };

  const [o, l, b, c, st, pendingVerification, pendingReviews, recentOrders] = await Promise.all([
    db
      .collection("orders")
      .aggregate([
        scan,
        {
          $facet: {
            current: [cur, ...orderTotals],
            previous: [prev, ...orderTotals],
            series: [
              cur,
              live,
              {
                $group: {
                  _id: bucket,
                  orders: { $sum: 1 },
                  paidOrders: { $sum: { $cond: [isPaid, 1, 0] } },
                  gmv: { $sum: { $cond: [isPaid, "$totalAmount", 0] } },
                },
              },
            ],
            byStore: [
              cur,
              live,
              {
                $group: {
                  _id: "$storeId",
                  orders: { $sum: 1 },
                  paidOrders: { $sum: { $cond: [isPaid, 1, 0] } },
                  gmv: { $sum: { $cond: [isPaid, "$totalAmount", 0] } },
                  lastOrderAt: { $max: "$createdAt" },
                },
              },
              { $sort: { gmv: -1, orders: -1 } },
              { $limit: LEADERBOARD },
              { $lookup: { from: "stores", localField: "_id", foreignField: "_id", as: "store", pipeline: [{ $project: STORE_CARD }] } },
              { $unwind: "$store" },
              { $match: { "store.status": { $ne: "deleted" } } },
            ],
            topProducts: [
              cur,
              { $match: { paymentStatus: "paid" } },
              { $unwind: "$items" },
              {
                $group: {
                  _id: "$items.productId",
                  name: { $first: "$items.name" },
                  storeId: { $first: "$storeId" },
                  quantity: { $sum: "$items.quantity" },
                  revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                },
              },
              { $sort: { revenue: -1 } },
              { $limit: 10 },
            ],
            byStatus: [cur, { $group: { _id: { $cond: [isAbandoned, "abandoned", "$status"] }, count: { $sum: 1 } } }],
            byMethod: [
              cur,
              live,
              {
                $group: {
                  _id: "$paymentInfo.method",
                  count: { $sum: 1 },
                  gmv: { $sum: { $cond: [isPaid, "$totalAmount", 0] } },
                },
              },
              { $sort: { count: -1 } },
            ],
          },
        },
      ])
      .next(),
    db
      .collection("credittransactions")
      .aggregate([
        scan,
        {
          $facet: {
            current: [cur, ...creditTotals],
            previous: [prev, ...creditTotals],
            series: [cur, spentOnly, { $group: { _id: bucket, creditsUsed: { $sum: spent } } }],
            byStore: [cur, spentOnly, { $group: { _id: "$storeId", used: { $sum: spent } } }],
            byAction: [
              cur,
              spentOnly,
              { $group: { _id: { $ifNull: ["$metadata.action", "$type"] }, credits: { $sum: spent } } },
              { $sort: { credits: -1 } },
            ],
          },
        },
      ])
      .next(),
    db
      .collection("billingorders")
      .aggregate([
        { $match: { $or: [scan.$match, { status: "pending" }] } },
        {
          $facet: {
            current: [cur, ...billingTotals],
            previous: [prev, ...billingTotals],
            series: [
              cur,
              paidOnly,
              { $group: { _id: bucket, billingRevenue: { $sum: "$amount" }, creditsBought: { $sum: "$creditsToGrant" } } },
            ],
            pending: [
              { $match: { status: "pending" } },
              { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
            ],
          },
        },
      ])
      .next(),
    db
      .collection("customers")
      .aggregate([scan, { $facet: { current: [cur, { $count: "n" }], previous: [prev, { $count: "n" }] } }])
      .next(),
    stores
      .aggregate([
        { $match: LIVE_STORE },
        {
          $facet: {
            total: [{ $count: "n" }],
            plans: [{ $group: { _id: { $ifNull: ["$credits.plan", "free"] }, count: { $sum: 1 } } }],
            outstanding: [{ $group: { _id: null, total: { $sum: "$credits.balance" } } }],
            lots: [
              { $unwind: "$credits.lots" },
              { $replaceWith: "$credits.lots" },
              { $match: { remaining: { $gt: 0 }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] } },
              {
                $group: {
                  _id: { $switch: { branches: [{ case: { $in: ["$source", ["plan", "pack"]] }, then: "$source" }], default: "free" } },
                  remaining: { $sum: "$remaining" },
                  expiring: { $sum: { $cond: [{ $and: [{ $ne: [expiresAt, null] }, { $lte: [expiresAt, soon] }] }, "$remaining", 0] } },
                },
              },
            ],
            // ponytail: returns every paying seller; paginate once there are thousands.
            subscribers: [
              { $match: { "credits.plan": { $nin: [null, "free"] }, "credits.subscriptionStatus": { $in: ["active", "past_due"] } } },
              { $project: { storeName: 1, credits: 1 } },
              { $project: { "credits.lots": 0 } },
            ],
            lowBalanceCount: [lowBalance, { $count: "n" }],
            lowBalance: [lowBalance, { $sort: { "credits.balance": 1 } }, { $limit: 20 }, { $project: STORE_CARD }],
            joinedCurrent: [cur, { $count: "n" }],
            joinedPrevious: [prev, { $count: "n" }],
            series: [cur, { $group: { _id: bucket, newSellers: { $sum: 1 } } }],
            recent: [{ $sort: { createdAt: -1 } }, { $limit: 6 }, { $project: STORE_CARD }],
          },
        },
      ])
      .next(),
    db.collection("orders").countDocuments({
      status: "pending",
      paymentStatus: "pending",
      "paymentInfo.method": "upi_manual",
      stockReleased: { $ne: true },
    }),
    db.collection("reviews").countDocuments({ status: "pending" }),
    db
      .collection("orders")
      .find(NOT_ABANDONED, {
        projection: {
          orderNumber: 1,
          storeId: 1,
          totalAmount: 1,
          status: 1,
          paymentStatus: 1,
          createdAt: 1,
          "customerInfo.firstName": 1,
          "customerInfo.lastName": 1,
        },
      })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray(),
  ]);

  const first1 = (rows: unknown) => (rows as Doc[] | undefined)?.[0];
  const totals = (which: "current" | "previous") => {
    const ord = first1(o?.[which]);
    const cred = first1(l?.[which]);
    const bill = first1(b?.[which]);
    return {
      orders: num(ord?.orders),
      paidOrders: num(ord?.paidOrders),
      gmv: num(ord?.gmv),
      codOrders: num(ord?.cod),
      abandoned: num(ord?.abandoned),
      activeSellers: num(ord?.activeSellers),
      billingRevenue: num(bill?.revenue),
      packRevenue: num(bill?.packRevenue),
      subscriptionRevenue: num(bill?.subscriptionRevenue),
      creditsBought: num(bill?.credits),
      purchases: num(bill?.purchases),
      creditsUsed: num(cred?.used),
      creditsGranted: num(cred?.granted),
      newCustomers: num(first1(c?.[which])?.n),
      newSellers: num(first1(st?.[which === "current" ? "joinedCurrent" : "joinedPrevious"])?.n),
    };
  };

  // Point-in-time: subscriptions and live (unexpired) credit lots.
  const credits = { outstanding: num(first1(st?.outstanding)?.total), free: 0, plan: 0, pack: 0, expiring7d: 0 };
  for (const lot of (st?.lots ?? []) as Doc[]) {
    credits[lot._id as "free" | "plan" | "pack"] += num(lot.remaining);
    credits.expiring7d += num(lot.expiring);
  }
  let mrr = 0;
  const subscribers = ((st?.subscribers ?? []) as Doc[]).map((store) => {
    const cr = store.credits ?? {};
    // No gateway subscription id = plan set by hand (beta/comp), not revenue.
    const billed = Boolean(cr.subscriptionId);
    const price = SMOL_PLAN_PRICES[cr.plan] ?? { monthly: 0, annual: 0 };
    if (billed) mrr += cr.billingCycle === "annual" ? price.annual / 12 : price.monthly;
    return {
      storeId: store._id,
      name: store.storeName as string | undefined,
      plan: String(cr.plan),
      cycle: String(cr.billingCycle ?? "monthly"),
      status: cr.subscriptionStatus as string | undefined,
      billed,
      cancelAtPeriodEnd: Boolean(cr.cancelAtPeriodEnd),
      currentPeriodEnd: cr.currentPeriodEnd as Date | undefined,
    };
  });

  // Leaderboard: top sellers by GMV, topped up with the newest zero-order sellers so small platforms list everyone.
  const usageByStore = new Map(((l?.byStore ?? []) as Doc[]).map((row) => [String(row._id), num(row.used)]));
  const ranked = (o?.byStore ?? []) as Doc[];
  const idle =
    ranked.length < LEADERBOARD
      ? await stores
          .find({ ...LIVE_STORE, _id: { $nin: ranked.map((row) => row._id) } }, { projection: STORE_CARD })
          .sort({ createdAt: -1 })
          .limit(LEADERBOARD - ranked.length)
          .toArray()
      : [];
  const sellers = [...ranked.map((row) => ({ ...row, store: row.store as Doc })), ...idle.map((store) => ({ _id: store._id, store }))].map(
    (row: Doc) => ({
      storeId: row._id,
      name: String(row.store.storeName ?? row.store.domain ?? "Unnamed"),
      domain: row.store.domain as string | undefined,
      status: String(row.store.status ?? "active"),
      plan: String(row.store.credits?.plan ?? "free"),
      balance: num(row.store.credits?.balance),
      joinedAt: row.store.createdAt as Date | undefined,
      orders: num(row.orders),
      paidOrders: num(row.paidOrders),
      gmv: num(row.gmv),
      lastOrderAt: (row.lastOrderAt as Date | undefined) ?? null,
      creditsUsed: usageByStore.get(String(row._id)) ?? 0,
    }),
  );

  const series = new Map(
    bucketKeys(from, to, interval).map((key) => [
      key,
      { key, orders: 0, paidOrders: 0, gmv: 0, newSellers: 0, creditsUsed: 0, billingRevenue: 0, creditsBought: 0 },
    ]),
  );
  for (const rows of [o?.series, l?.series, b?.series, st?.series] as (Doc[] | undefined)[]) {
    for (const { _id, ...values } of rows ?? []) {
      const point = series.get(String(_id));
      if (point) Object.assign(point, values);
    }
  }
  const pendingBilling = first1(b?.pending);
  const card = (store: Doc) => ({
    storeId: store._id,
    name: store.storeName as string | undefined,
    domain: store.domain as string | undefined,
    plan: String(store.credits?.plan ?? "free"),
    balance: num(store.credits?.balance),
    joinedAt: store.createdAt as Date | undefined,
  });

  return toPlain({
    generatedAt: now,
    range: { from, to, interval, compare, prevFrom: istDate(prevStart), prevTo: istDate(prevEnd) },
    current: totals("current"),
    previous: compare ? totals("previous") : null,
    series: [...series.values()],
    totalSellers: num(first1(st?.total)?.n),
    subscriptions: {
      paid: subscribers.filter((s) => s.billed).length,
      comped: subscribers.filter((s) => !s.billed).length,
      pastDue: subscribers.filter((s) => s.status === "past_due").length,
      cancelling: subscribers.filter((s) => s.cancelAtPeriodEnd).length,
      mrr: Math.round(mrr),
      plans: ((st?.plans ?? []) as Doc[]).map((row) => ({ plan: String(row._id), count: num(row.count) })),
      list: subscribers,
    },
    credits,
    sellers,
    topProducts: ((o?.topProducts ?? []) as Doc[]).map((row) => ({
      productId: row._id,
      name: String(row.name ?? ""),
      storeId: row.storeId,
      quantity: num(row.quantity),
      revenue: num(row.revenue),
    })),
    byStatus: ((o?.byStatus ?? []) as Doc[]).map((row) => ({ status: String(row._id ?? "unknown"), count: num(row.count) })),
    byMethod: ((o?.byMethod ?? []) as Doc[]).map((row) => ({
      method: String(row._id ?? "unknown"),
      count: num(row.count),
      gmv: num(row.gmv),
    })),
    usageByAction: ((l?.byAction ?? []) as Doc[]).map((row) => ({ action: String(row._id ?? "other"), credits: num(row.credits) })),
    attention: {
      pendingVerification,
      pendingReviews,
      pendingBilling: { count: num(pendingBilling?.count), amount: num(pendingBilling?.amount) },
      lowBalanceCount: num(first1(st?.lowBalanceCount)?.n),
      lowBalance: ((st?.lowBalance ?? []) as Doc[]).map(card),
    },
    recentOrders,
    recentSellers: ((st?.recent ?? []) as Doc[]).map(card),
  });
}
export type SmolIntel = Awaited<ReturnType<typeof loadIntel>>;

