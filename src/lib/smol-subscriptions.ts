import { SMOL_PLAN_PRICES } from "@/lib/smol-config";

// Subscription history (SMOL-421) rebuilt from paid subscription billing orders + backend subscriptionevents. Pure, so it is testable.

export interface SubBillingRow {
  storeId: string;
  planKey?: string;
  billingCycle?: string;
  amount: number;
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  status: string;
  createdAt: Date;
}
export interface SubEventRow {
  storeId: string;
  type: "cancel_requested" | "ended" | "admin_change";
  planKey?: string;
  fromPlan?: string;
  subscriptionId?: string;
  by?: string;
  createdAt: Date;
}
export interface SubStoreRow {
  storeId: string;
  name?: string;
  credits?: {
    plan?: string;
    subscriptionId?: string;
    subscriptionStatus?: string;
    subscriptionProvider?: string;
    billingCycle?: string;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: Date;
    subscriptionTermEnd?: Date;
  };
}

export type SubActivityKind = "new" | "renewed" | "renewal_failed" | "upgraded" | "downgraded" | "changed" | "cancelled" | "ended" | "admin";
export interface SubActivity {
  kind: SubActivityKind;
  storeId: string;
  plan?: string;
  fromPlan?: string;
  cycle?: string;
  amount?: number;
  by?: string;
  at: Date;
}

interface Interval {
  storeId: string;
  subscriptionId: string;
  plan: string;
  cycle: string;
  mrr: number;
  start: Date;
  end: Date | null;
  /** Ended into free (churn), not superseded by another paid subscription. */
  churned: boolean;
}

const DAY_MS = 86_400_000;
const monthly = (plan?: string, cycle?: string) => {
  const price = SMOL_PLAN_PRICES[plan ?? ""] ?? { monthly: 0, annual: 0 };
  return cycle === "annual" ? price.annual / 12 : price.monthly;
};
const time = (date: Date) => new Date(date).getTime();

export function buildSubscriptionHistory(rows: SubBillingRow[], events: SubEventRow[], stores: SubStoreRow[], now = new Date()) {
  const storeById = new Map(stores.map((store) => [store.storeId, store]));
  // A renewal row is keyed by its payment id; the signup row by the subscription id.
  const isRenewal = (row: SubBillingRow) => !!row.gatewayPaymentId && row.gatewayOrderId === row.gatewayPaymentId;
  const paid = rows.filter((row) => row.status === "paid").sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const signups = paid.filter((row) => !isRenewal(row));
  const renewals = rows.filter(isRenewal);

  const intervals: Interval[] = [];
  const activity: SubActivity[] = [];
  const byStore = new Map<string, SubBillingRow[]>();
  for (const row of signups) byStore.set(row.storeId, [...(byStore.get(row.storeId) ?? []), row]);

  for (const [storeId, list] of byStore) {
    const store = storeById.get(storeId);
    list.forEach((row, index) => {
      const start = new Date(row.createdAt);
      const next = list[index + 1];
      const nextStart = next ? new Date(next.createdAt) : null;
      const cycle = row.billingCycle ?? "monthly";
      const live = !next && store?.credits?.subscriptionId === row.gatewayOrderId && store.credits.subscriptionStatus !== "cancelled";
      const endedEvent = events.find(
        (event) =>
          event.type === "ended" &&
          event.storeId === storeId &&
          (event.subscriptionId ? event.subscriptionId === row.gatewayOrderId : time(event.createdAt) >= time(start) && (!nextStart || time(event.createdAt) < time(nextStart))),
      );
      // ponytail: subscriptions that ended before subscriptionevents existed are dated last payment + one cycle.
      const lastPaid = Math.max(time(start), ...renewals.filter((r) => r.storeId === storeId && r.status === "paid" && time(r.createdAt) >= time(start) && (!nextStart || time(r.createdAt) < time(nextStart))).map((r) => time(r.createdAt)));
      const inferred = new Date(Math.min(lastPaid + (cycle === "annual" ? 365 : 30) * DAY_MS, time(now)));
      // Earliest of: the next signup (a switch), the logged end, or the inferred end; a gap before the next signup is churn.
      const ended = endedEvent ? new Date(endedEvent.createdAt) : inferred;
      const end = live ? null : nextStart && time(nextStart) <= time(ended) ? nextStart : ended;
      intervals.push({ storeId, subscriptionId: row.gatewayOrderId, plan: row.planKey ?? "?", cycle, mrr: monthly(row.planKey, cycle), start, end, churned: !live && end !== nextStart });

      const prev = intervals.length > 1 ? intervals[intervals.length - 2] : null;
      const switched = index > 0 && prev?.storeId === storeId && prev.end && time(prev.end) === time(start);
      const kind: SubActivityKind = !switched ? "new" : monthly(row.planKey, cycle) > prev!.mrr ? "upgraded" : monthly(row.planKey, cycle) < prev!.mrr ? "downgraded" : "changed";
      activity.push({ kind, storeId, plan: row.planKey, fromPlan: switched ? prev!.plan : undefined, cycle, amount: row.amount, at: start });
    });
  }

  for (const row of renewals) {
    activity.push({ kind: row.status === "paid" ? "renewed" : "renewal_failed", storeId: row.storeId, plan: row.planKey, cycle: row.billingCycle, amount: row.amount, at: new Date(row.createdAt) });
  }
  for (const event of events) {
    const kind: SubActivityKind = event.type === "cancel_requested" ? "cancelled" : event.type === "ended" ? (event.by ? "admin" : "ended") : "admin";
    activity.push({ kind, storeId: event.storeId, plan: event.planKey, fromPlan: event.fromPlan, by: event.by, at: new Date(event.createdAt) });
  }
  activity.sort((a, b) => time(b.at) - time(a.at));

  const liveAt = (at: Date) => intervals.filter((i) => time(i.start) <= time(at) && (!i.end || time(i.end) > time(at)));
  const mrrAt = (at: Date) => Math.round(liveAt(at).reduce((sum, i) => sum + i.mrr, 0));

  /** New / cancelled / churned counts and MRR movement for [from, to]. */
  const period = (from: Date, to: Date) => {
    const inside = (at: Date) => time(at) >= time(from) && time(at) <= time(to);
    const end = new Date(Math.min(time(to), time(now)));
    return {
      new: activity.filter((a) => a.kind === "new" && inside(a.at)).length,
      upgraded: activity.filter((a) => a.kind === "upgraded" && inside(a.at)).length,
      downgraded: activity.filter((a) => a.kind === "downgraded" && inside(a.at)).length,
      renewed: activity.filter((a) => a.kind === "renewed" && inside(a.at)).length,
      cancelled: activity.filter((a) => a.kind === "cancelled" && inside(a.at)).length,
      churned: intervals.filter((i) => i.churned && i.end && inside(i.end)).length,
      mrrStart: mrrAt(from),
      mrrEnd: mrrAt(end),
      netMrrChange: mrrAt(end) - mrrAt(from),
    };
  };

  // Right now: committed vs at-risk MRR, and renewals due within 7 days.
  let committedMrr = 0;
  let atRiskMrr = 0;
  const dueSoon: { storeId: string; name?: string; plan?: string; cycle: string; dueAt: Date }[] = [];
  for (const i of liveAt(now)) {
    const credits = storeById.get(i.storeId)?.credits;
    const risky = credits?.subscriptionStatus === "past_due" || !!credits?.cancelAtPeriodEnd;
    if (risky) atRiskMrr += i.mrr;
    else committedMrr += i.mrr;
    const due = i.cycle === "annual" ? credits?.subscriptionTermEnd : credits?.currentPeriodEnd;
    if (!risky && due && time(due) >= time(now) && time(due) <= time(now) + 7 * DAY_MS) {
      dueSoon.push({ storeId: i.storeId, name: storeById.get(i.storeId)?.name, plan: i.plan, cycle: i.cycle, dueAt: new Date(due) });
    }
  }
  dueSoon.sort((a, b) => time(a.dueAt) - time(b.dueAt));

  return {
    activity,
    period,
    mrrAt,
    subscribersAt: (at: Date) => liveAt(at).length,
    committedMrr: Math.round(committedMrr),
    atRiskMrr: Math.round(atRiskMrr),
    dueSoon,
  };
}
