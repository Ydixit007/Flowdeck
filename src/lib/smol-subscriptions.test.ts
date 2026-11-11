import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSubscriptionHistory, type SubBillingRow, type SubEventRow, type SubStoreRow } from "./smol-subscriptions";

const d = (day: string) => new Date(`${day}T12:00:00.000Z`);
const signup = (storeId: string, sub: string, planKey: string, day: string, cycle = "monthly"): SubBillingRow => ({
  storeId, planKey, billingCycle: cycle, amount: 0, gatewayOrderId: sub, gatewayPaymentId: `pay_first_${sub}`, status: "paid", createdAt: d(day),
});
const renewal = (storeId: string, planKey: string, day: string, status = "paid"): SubBillingRow => ({
  storeId, planKey, billingCycle: "monthly", amount: 299, gatewayOrderId: `pay_${day}`, gatewayPaymentId: `pay_${day}`, status, createdAt: d(day),
});

test("subscription history: new, renewal, upgrade, cancel, churn and MRR", () => {
  const now = d("2026-11-10");
  const rows = [
    signup("a", "sub_a1", "starter", "2026-09-01"),
    renewal("a", "starter", "2026-10-01"),
    signup("a", "sub_a2", "growth", "2026-10-15"), // upgrade, still live
    signup("b", "sub_b1", "starter", "2026-10-05"), // ended by an event
    signup("c", "sub_c1", "pro", "2026-11-01"), // live but cancelling
    { ...signup("d", "sub_d1", "pro", "2026-11-02"), status: "pending" }, // abandoned checkout: ignored
  ];
  const events: SubEventRow[] = [
    { storeId: "b", type: "ended", planKey: "free", fromPlan: "starter", subscriptionId: "sub_b1", createdAt: d("2026-11-03") },
    { storeId: "c", type: "cancel_requested", planKey: "pro", createdAt: d("2026-11-04") },
    { storeId: "e", type: "admin_change", planKey: "growth", fromPlan: "free", by: "ops@smolbusiness.in", createdAt: d("2026-11-05") },
  ];
  const stores: SubStoreRow[] = [
    { storeId: "a", credits: { subscriptionId: "sub_a2", subscriptionStatus: "active", currentPeriodEnd: d("2026-11-14") } },
    { storeId: "b", credits: { subscriptionStatus: "cancelled" } },
    { storeId: "c", credits: { subscriptionId: "sub_c1", subscriptionStatus: "active", cancelAtPeriodEnd: true } },
  ];
  const h = buildSubscriptionHistory(rows, events, stores, now);

  const kinds = h.activity.map((a) => `${a.storeId}:${a.kind}`);
  assert.deepEqual(
    kinds.sort(),
    ["a:new", "a:renewed", "a:upgraded", "b:ended", "b:new", "c:cancelled", "c:new", "e:admin"].sort(),
  );
  assert.equal(h.activity.find((a) => a.kind === "upgraded")?.fromPlan, "starter");

  const nov = h.period(d("2026-11-01"), d("2026-11-30"));
  assert.equal(nov.new, 1, "only c started in November");
  assert.equal(nov.cancelled, 1);
  assert.equal(nov.churned, 1, "b ended into free; a's upgrade is not churn");
  assert.equal(h.mrrAt(d("2026-09-15")), 299);
  assert.equal(h.mrrAt(now), 799 + 1999, "a on growth + c on pro; b gone");
  assert.equal(nov.netMrrChange, h.mrrAt(now) - h.mrrAt(d("2026-11-01")));

  assert.equal(h.committedMrr, 799, "a is committed");
  assert.equal(h.atRiskMrr, 1999, "c is cancelling");
  assert.deepEqual(h.dueSoon.map((r) => r.storeId), ["a"], "a renews within 7 days");
});

test("a resubscribe after a gap is churn then new, not an upgrade", () => {
  const rows = [signup("r", "sub_r1", "starter", "2026-01-01"), signup("r", "sub_r2", "growth", "2026-06-01")];
  const events: SubEventRow[] = [{ storeId: "r", type: "ended", subscriptionId: "sub_r1", createdAt: d("2026-02-01") }];
  const h = buildSubscriptionHistory(rows, events, [{ storeId: "r", credits: { subscriptionId: "sub_r2", subscriptionStatus: "active" } }], d("2026-07-01"));
  assert.equal(h.mrrAt(d("2026-03-15")), 0, "nothing billed in the gap");
  assert.deepEqual(h.activity.filter((a) => a.kind === "new").length, 2);
  assert.equal(h.period(d("2026-01-15"), d("2026-02-15")).churned, 1);
});

test("subscription history infers the end of a pre-event subscription from its last payment", () => {
  const h = buildSubscriptionHistory([signup("x", "sub_x", "starter", "2026-01-01")], [], [{ storeId: "x", credits: {} }], d("2026-11-10"));
  assert.equal(h.mrrAt(d("2026-01-20")), 299);
  assert.equal(h.mrrAt(d("2026-02-15")), 0, "one month after the last payment");
  assert.equal(h.period(d("2026-01-01"), d("2026-03-01")).churned, 1);
});
