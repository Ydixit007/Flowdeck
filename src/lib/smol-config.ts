// Shared (client + server) description of the SmolBusiness collections the admin dashboard exposes.

export type SmolKind = "text" | "money" | "number" | "date" | "bool" | "badge" | "store" | "long" | "resolved";

export interface SmolColumn {
  key: string;
  label: string;
  kind?: SmolKind;
}

export interface SmolCollection {
  label: string;
  group: "Sellers" | "Commerce" | "Billing" | "Platform";
  /** Fields matched by the search box (case-insensitive substring). */
  search: string[];
  /** Fields offered as dropdown filters; options come from distinct values. */
  filters: { key: string; label: string }[];
  columns: SmolColumn[];
  defaultSort: string;
  /** Has a storeId, so it can be filtered by seller. */
  storeScoped?: boolean;
}

export const SMOL_COLLECTIONS = {
  stores: {
    label: "Sellers",
    group: "Sellers",
    search: ["storeName", "domain", "email", "phone", "instagram", "orderPrefix"],
    filters: [
      { key: "status", label: "Status" },
      { key: "theme", label: "Theme" },
      { key: "credits.plan", label: "Plan" },
      { key: "paymentConfig.method", label: "Payment" },
    ],
    columns: [
      { key: "storeName", label: "Store" },
      { key: "domain", label: "Domain" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "instagram", label: "Instagram" },
      { key: "credits.balance", label: "Credits", kind: "number" },
      { key: "credits.plan", label: "Plan", kind: "badge" },
      { key: "theme", label: "Theme", kind: "badge" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "createdAt", label: "Joined", kind: "date" },
    ],
    defaultSort: "createdAt",
  },
  orders: {
    label: "Orders",
    group: "Commerce",
    search: [
      "orderNumber",
      "customerInfo.firstName",
      "customerInfo.lastName",
      "customerInfo.email",
      "customerInfo.phone",
      "shippingAddress.city",
    ],
    filters: [
      { key: "status", label: "Status" },
      { key: "paymentStatus", label: "Payment" },
      { key: "paymentInfo.method", label: "Method" },
    ],
    columns: [
      { key: "orderNumber", label: "Order" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "customerInfo.firstName", label: "First name" },
      { key: "customerInfo.lastName", label: "Last name" },
      { key: "customerInfo.phone", label: "Phone" },
      { key: "shippingAddress.city", label: "City" },
      { key: "totalAmount", label: "Total", kind: "money" },
      { key: "paymentInfo.method", label: "Method", kind: "badge" },
      { key: "paymentStatus", label: "Payment", kind: "badge" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "createdAt", label: "Placed", kind: "date" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  customers: {
    label: "Customers",
    group: "Commerce",
    search: ["firstName", "lastName", "email", "phone"],
    filters: [],
    columns: [
      { key: "firstName", label: "First name" },
      { key: "lastName", label: "Last name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "totalOrders", label: "Orders", kind: "number" },
      { key: "totalSpent", label: "Spent", kind: "money" },
      { key: "lastOrderAt", label: "Last order", kind: "date" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    defaultSort: "lastOrderAt",
    storeScoped: true,
  },
  products: {
    label: "Products",
    group: "Commerce",
    search: ["name", "slug", "category", "description"],
    filters: [
      { key: "category", label: "Category" },
      { key: "published", label: "Published" },
      { key: "isFeatured", label: "Featured" },
    ],
    columns: [
      { key: "name", label: "Product" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "category", label: "Category", kind: "badge" },
      { key: "price", label: "Price", kind: "money" },
      { key: "mrp", label: "MRP", kind: "money" },
      { key: "stock", label: "Stock", kind: "number" },
      { key: "purchaseCount", label: "Sold", kind: "number" },
      { key: "published", label: "Published", kind: "bool" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  reviews: {
    label: "Reviews",
    group: "Commerce",
    search: ["customerName", "customerPhone", "comment"],
    filters: [
      { key: "status", label: "Status" },
      { key: "rating", label: "Rating" },
    ],
    columns: [
      { key: "customerName", label: "Customer" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "rating", label: "Rating", kind: "number" },
      { key: "comment", label: "Comment", kind: "long" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "createdAt", label: "Posted", kind: "date" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  coupons: {
    label: "Coupons",
    group: "Commerce",
    search: ["code", "description"],
    filters: [
      { key: "active", label: "Active" },
      { key: "discountType", label: "Type" },
      { key: "newCustomerOnly", label: "New customers" },
    ],
    columns: [
      { key: "code", label: "Code" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "discountType", label: "Type", kind: "badge" },
      { key: "discountValue", label: "Value", kind: "number" },
      { key: "maxDiscount", label: "Max off", kind: "money" },
      { key: "redemptionCount", label: "Used", kind: "number" },
      { key: "active", label: "Active", kind: "bool" },
      { key: "expiresAt", label: "Expires", kind: "date" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  credittransactions: {
    label: "Credit ledger",
    group: "Billing",
    search: ["reason", "metadata.orderNumber", "metadata.action"],
    filters: [
      { key: "type", label: "Type" },
      { key: "metadata.action", label: "Action" },
    ],
    columns: [
      { key: "createdAt", label: "When", kind: "date" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "type", label: "Type", kind: "badge" },
      { key: "amount", label: "Amount", kind: "number" },
      { key: "balanceAfter", label: "Balance after", kind: "number" },
      { key: "reason", label: "Reason" },
      { key: "metadata.action", label: "Action", kind: "badge" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  billingorders: {
    label: "Billing orders",
    group: "Billing",
    search: ["gatewayOrderId", "packKey"],
    filters: [
      { key: "status", label: "Status" },
      { key: "kind", label: "Kind" },
      { key: "packKey", label: "Pack" },
    ],
    columns: [
      { key: "createdAt", label: "When", kind: "date" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "kind", label: "Kind", kind: "badge" },
      { key: "packKey", label: "Pack", kind: "badge" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "creditsToGrant", label: "Credits", kind: "number" },
      { key: "gatewayOrderId", label: "Gateway ID" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  emailbudgets: {
    label: "Email budget",
    group: "Billing",
    search: ["day"],
    filters: [],
    columns: [
      { key: "day", label: "Day" },
      { key: "sent", label: "Sent", kind: "number" },
      { key: "createdAt", label: "Created", kind: "date" },
    ],
    defaultSort: "day",
  },
  storelayoutrevisions: {
    label: "Layout revisions",
    group: "Sellers",
    search: ["layout.theme"],
    filters: [{ key: "layout.theme", label: "Theme" }],
    columns: [
      { key: "createdAt", label: "Saved", kind: "date" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "layout.theme", label: "Theme", kind: "badge" },
      { key: "layout.version", label: "Version", kind: "number" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  announcements: {
    label: "Announcements",
    group: "Platform",
    search: ["title", "content", "key"],
    filters: [
      { key: "type", label: "Type" },
      { key: "published", label: "Published" },
    ],
    columns: [
      { key: "title", label: "Title" },
      { key: "type", label: "Type", kind: "badge" },
      { key: "content", label: "Content", kind: "long" },
      { key: "published", label: "Published", kind: "bool" },
      { key: "releasedAt", label: "Released", kind: "date" },
    ],
    defaultSort: "releasedAt",
  },
  themes: {
    label: "Themes",
    group: "Platform",
    search: ["themeName", "label", "description"],
    filters: [
      { key: "composable", label: "Composable" },
      { key: "hidden", label: "Hidden" },
    ],
    columns: [
      { key: "label", label: "Theme" },
      { key: "themeName", label: "Key" },
      { key: "description", label: "Description", kind: "long" },
      { key: "sortOrder", label: "Order", kind: "number" },
      { key: "composable", label: "Composable", kind: "bool" },
      { key: "hidden", label: "Hidden", kind: "bool" },
      { key: "updatedAt", label: "Updated", kind: "date" },
    ],
    defaultSort: "sortOrder",
  },
  featurerequests: {
    label: "Feature requests",
    group: "Platform",
    search: ["title", "description", "phone", "storeName"],
    filters: [{ key: "resolvedAt", label: "Status" }],
    columns: [
      { key: "title", label: "Title" },
      { key: "description", label: "Description", kind: "long" },
      { key: "storeId", label: "Store", kind: "store" },
      { key: "phone", label: "Phone" },
      { key: "createdAt", label: "Created", kind: "date" },
      { key: "resolvedAt", label: "Status", kind: "resolved" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  contacts: {
    label: "Contacts",
    group: "Platform",
    search: ["storeName", "email", "phone", "message"],
    filters: [
      { key: "topic", label: "Topic" },
      { key: "resolvedAt", label: "Status" },
    ],
    columns: [
      { key: "storeName", label: "Store" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "topic", label: "Topic", kind: "badge" },
      { key: "message", label: "Message", kind: "long" },
      { key: "createdAt", label: "Received", kind: "date" },
      { key: "resolvedAt", label: "Status", kind: "resolved" },
    ],
    defaultSort: "createdAt",
    storeScoped: true,
  },
  otps: {
    label: "OTPs",
    group: "Platform",
    search: ["phone", "email"],
    filters: [],
    columns: [
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "createdAt", label: "Created", kind: "date" },
      { key: "expiresAt", label: "Expires", kind: "date" },
    ],
    defaultSort: "createdAt",
  },
} satisfies Record<string, SmolCollection>;

export type SmolCollectionName = keyof typeof SMOL_COLLECTIONS;

/** Collections ops can mark resolved (sets `resolvedAt`). */
export const SMOL_RESOLVABLE = new Set<SmolCollectionName>(["contacts", "featurerequests"]);

export const SMOL_ANNOUNCEMENT_TYPES = ["feature", "improvement", "fix", "notice"] as const;

export function isSmolCollection(name: string): name is SmolCollectionName {
  return Object.hasOwn(SMOL_COLLECTIONS, name);
}

/** ₹ per cycle. ponytail: mirrors smolBusiness-backend src/config/credits.ts PLANS; update both together. */
export const SMOL_PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 299, annual: 2990 },
  growth: { monthly: 799, annual: 7990 },
  pro: { monthly: 1999, annual: 19990 },
};
/** Order lifecycle, in display order. `abandoned` is virtual: pending + stockReleased. */
export const SMOL_ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "abandoned", "cancelled", "refunded"];

/** Backend LOW_BALANCE_THRESHOLD: at or below this a seller is warned. */
export const SMOL_LOW_BALANCE = 50;

export const SMOL_PLAN_ORDER = ["free", "starter", "growth", "pro"];

export type SmolInterval = "day" | "week" | "month";

/** Chart grouping for an inclusive span of `days`; daily is capped at ~13 months of points. */
export function chartInterval(days: number, requested: SmolInterval | "auto"): SmolInterval {
  if (requested === "auto") return days <= 45 ? "day" : days <= 210 ? "week" : "month";
  return requested === "day" && days > 400 ? "week" : requested;
}

/** Calendar dates are IST: SmolBusiness is an India-only platform. */
export const todayIST = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function shiftDate(date: string, days = 0, months = 0): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months, d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const SMOL_PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "12m", label: "12M" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
] as const;
export type SmolPeriod = (typeof SMOL_PERIODS)[number]["key"] | "custom";

/** Period preset → inclusive IST date range. `all` has no lower bound. */
export function periodRange(period: string, custom: { from?: string; to?: string } = {}): { from?: string; to?: string } {
  const today = todayIST();
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: shiftDate(today, -6), to: today };
    case "30d":
      return { from: shiftDate(today, -29), to: today };
    case "90d":
      return { from: shiftDate(today, -89), to: today };
    case "12m":
      return { from: shiftDate(today, 1, -12), to: today };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      return custom;
    default:
      return {};
  }
}

/** Bucket key for an IST calendar date: the day, its Monday, or its month. */
export function bucketOf(date: string, interval: SmolInterval): string {
  if (interval === "month") return date.slice(0, 7);
  if (interval === "day") return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Every bucket key between two IST dates, so charts show gaps as zero. */
export function bucketKeys(from: string, to: string, interval: SmolInterval): string[] {
  const keys: string[] = [];
  const first = bucketOf(from, interval);
  const cursor = new Date(`${interval === "month" ? `${first}-01` : first}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, interval === "month" ? 7 : 10));
    if (interval === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (interval === "week" ? 7 : 1));
  }
  return keys;
}

/** Reads a dotted path ("customerInfo.phone") from a plain object. */
export function getPath(doc: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | null)?.[key], doc);
}
