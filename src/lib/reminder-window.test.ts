import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldFire, REMINDER_GRACE_MS } from "./reminder-window";

const noon = new Date(2026, 0, 1, 12, 0, 0);
const offset = (ms: number): Date => new Date(noon.getTime() + ms);

test("a task that has not started yet stays quiet", () => {
  assert.equal(shouldFire(offset(10 * 60_000), noon), false);
  assert.equal(shouldFire(offset(1000), noon), false);
});

test("a task starting right now fires", () => {
  assert.equal(shouldFire(noon, noon), true);
});

test("a start inside the grace window still fires", () => {
  assert.equal(shouldFire(offset(-REMINDER_GRACE_MS + 1000), noon), true);
});

test("a start older than the grace window is dropped", () => {
  assert.equal(shouldFire(offset(-REMINDER_GRACE_MS - 1000), noon), false);
});
