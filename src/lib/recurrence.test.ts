import { test } from "node:test";
import assert from "node:assert/strict";
import { expandOccurrences } from "@/lib/recurrence";
import { formatTz } from "@/lib/tz";

const NY = "America/New_York";
const IST = "Asia/Kolkata";

const at = (iso: string): Date => new Date(iso);
const win = (from: string, to: string) => ({ from: at(from), to: at(to) });

test("daily series emits one occurrence per day", () => {
  const out = expandOccurrences(
    at("2026-03-02T14:00:00Z"),
    { freq: "DAILY", interval: 1 },
    win("2026-03-02T00:00:00Z", "2026-03-06T23:59:59Z"),
    "UTC",
  );
  assert.equal(out.length, 5);
});

test("weekdays skips weekends", () => {
  const out = expandOccurrences(
    at("2026-03-02T09:00:00Z"),
    { freq: "WEEKDAYS", interval: 1 },
    win("2026-03-02T00:00:00Z", "2026-03-15T23:59:59Z"),
    "UTC",
  );
  assert.equal(out.length, 10);
  for (const d of out) assert.ok(d.getUTCDay() >= 1 && d.getUTCDay() <= 5);
});

test("weekly on Mon/Wed/Fri hits three days a week", () => {
  const out = expandOccurrences(
    at("2026-03-02T18:30:00Z"),
    { freq: "WEEKLY", interval: 1, byWeekday: [1, 3, 5] },
    win("2026-03-02T00:00:00Z", "2026-03-15T23:59:59Z"),
    "UTC",
  );
  assert.equal(out.length, 6);
});

test("biweekly halves the weekly count", () => {
  const out = expandOccurrences(
    at("2026-03-03T10:00:00Z"),
    { freq: "BIWEEKLY", interval: 1, byWeekday: [2] },
    win("2026-03-01T00:00:00Z", "2026-04-30T23:59:59Z"),
    "UTC",
  );
  const gaps = out.slice(1).map((d, i) => d.getTime() - (out[i] as Date).getTime());
  for (const gap of gaps) assert.equal(gap, 14 * 86_400_000);
});

test("monthly on the 31st skips short months instead of clamping", () => {
  const out = expandOccurrences(
    at("2026-01-31T12:00:00Z"),
    { freq: "MONTHLY", interval: 1, byMonthDay: 31 },
    win("2026-01-01T00:00:00Z", "2026-06-30T23:59:59Z"),
    "UTC",
  );
  const days = out.map((d) => d.getUTCDate());
  assert.deepEqual(new Set(days), new Set([31]));
  assert.deepEqual(
    out.map((d) => d.getUTCMonth() + 1),
    [1, 3, 5],
  );
});

test("wall-clock time survives a DST transition", () => {
  // US DST starts 2026-03-08. A 09:00 New York task must stay 09:00 local.
  const out = expandOccurrences(
    at("2026-03-05T14:00:00Z"), // 09:00 EST
    { freq: "DAILY", interval: 1 },
    win("2026-03-05T00:00:00Z", "2026-03-11T23:59:59Z"),
    NY,
  );
  const locals = out.map((d) => formatTz(d, NY, "HH:mm"));
  assert.deepEqual(new Set(locals), new Set(["09:00"]));
  // Offset actually changed, so the UTC instants differ across the boundary.
  assert.notEqual(out[0]?.getUTCHours(), out[out.length - 1]?.getUTCHours());
});

test("count limit caps the series", () => {
  const out = expandOccurrences(
    at("2026-03-02T09:00:00Z"),
    { freq: "DAILY", interval: 1, count: 3 },
    win("2026-03-01T00:00:00Z", "2026-12-31T00:00:00Z"),
    "UTC",
  );
  assert.equal(out.length, 3);
});

test("until date ends the series", () => {
  const out = expandOccurrences(
    at("2026-03-02T09:00:00Z"),
    { freq: "DAILY", interval: 1, until: at("2026-03-04T23:59:59Z") },
    win("2026-03-01T00:00:00Z", "2026-12-31T00:00:00Z"),
    "UTC",
  );
  assert.equal(out.length, 3);
});

test("far-future window does not walk every past day", () => {
  const out = expandOccurrences(
    at("2015-01-01T05:30:00Z"),
    { freq: "DAILY", interval: 1 },
    win("2026-08-01T00:00:00Z", "2026-08-07T23:59:59Z"),
    IST,
  );
  assert.equal(out.length, 7);
});

test("weekly far-future window stays aligned", () => {
  const out = expandOccurrences(
    at("2020-01-07T13:30:00Z"),
    { freq: "WEEKLY", interval: 1, byWeekday: [2] },
    win("2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"),
    "UTC",
  );
  for (const d of out) assert.equal(d.getUTCDay(), 2);
  assert.ok(out.length >= 4);
});

test("occurrences before the series start are never emitted", () => {
  const out = expandOccurrences(
    at("2026-03-10T09:00:00Z"),
    { freq: "WEEKLY", interval: 1, byWeekday: [0, 1, 2, 3, 4, 5, 6] },
    win("2026-03-01T00:00:00Z", "2026-03-12T23:59:59Z"),
    "UTC",
  );
  for (const d of out) assert.ok(d >= at("2026-03-10T09:00:00Z"));
});
