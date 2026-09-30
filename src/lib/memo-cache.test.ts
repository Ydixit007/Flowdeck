import { test } from "node:test";
import assert from "node:assert/strict";
import { cached } from "./memo-cache";

test("cached dedupes, expires, bypasses on fresh, and forgets failures", async () => {
  let calls = 0;
  const load = async () => ++calls;
  assert.equal(await cached("a", 10_000, load), 1);
  assert.equal(await cached("a", 10_000, load), 1, "hit");
  assert.equal(await cached("a", 10_000, load, true), 2, "fresh bypasses");
  assert.equal(await cached("a", 0, load), 3, "expired");

  await assert.rejects(cached("b", 10_000, async () => Promise.reject(new Error("boom"))));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await cached("b", 10_000, async () => "ok"), "ok", "failure not cached");
});
