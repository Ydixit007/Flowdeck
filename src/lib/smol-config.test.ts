import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketKeys, bucketOf, chartInterval, periodRange, shiftDate, todayIST } from "./smol-config";

test("bucketKeys covers every day, Monday-week and month in range", () => {
  assert.deepEqual(bucketKeys("2026-09-29", "2026-10-01", "day"), ["2026-09-29", "2026-09-30", "2026-10-01"]);
  assert.deepEqual(bucketKeys("2026-09-30", "2026-10-08", "week"), ["2026-09-28", "2026-10-05"]);
  assert.deepEqual(bucketKeys("2026-08-15", "2026-10-01", "month"), ["2026-08", "2026-09", "2026-10"]);
});

test("bucketOf agrees with bucketKeys", () => {
  assert.equal(bucketOf("2026-10-01", "week"), "2026-09-28");
  assert.equal(bucketOf("2026-09-28", "week"), "2026-09-28");
  assert.equal(bucketOf("2026-10-04", "week"), "2026-09-28");
  assert.equal(bucketOf("2026-10-01", "month"), "2026-10");
  assert.ok(bucketKeys("2026-09-01", "2026-10-31", "week").includes(bucketOf("2026-10-15", "week")));
});

test("chartInterval auto-picks by span and caps daily", () => {
  assert.equal(chartInterval(30, "auto"), "day");
  assert.equal(chartInterval(90, "auto"), "week");
  assert.equal(chartInterval(365, "auto"), "month");
  assert.equal(chartInterval(500, "day"), "week");
  assert.equal(chartInterval(500, "month"), "month");
});

test("shiftDate crosses month and year boundaries", () => {
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDate("2026-01-15", 0, -1), "2025-12-15");
});

test("periodRange presets are inclusive and end today", () => {
  const today = todayIST();
  assert.deepEqual(periodRange("today"), { from: today, to: today });
  assert.equal(bucketKeys(periodRange("30d").from!, today, "day").length, 30);
  assert.deepEqual(periodRange("all"), {});
  assert.deepEqual(periodRange("custom", { from: "2026-01-01" }), { from: "2026-01-01" });
});
