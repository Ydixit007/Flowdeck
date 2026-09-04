import test from "node:test";
import assert from "node:assert/strict";
import { andFilters } from "@/lib/filters";

/** The bug this guards: spreading two filters that each carry $or silently
 *  dropped the visibility clause, leaking other people's private tasks. */
test("andFilters keeps every $and clause instead of overwriting", () => {
  const visibility = { workspaceId: 1, $and: [{ $or: [{ visibility: "WORKSPACE" }, { creatorId: "me" }] }] };
  const window = { $and: [{ $or: [{ startAt: { $gte: 1 } }, { dueAt: { $gte: 1 } }] }] };

  const merged = andFilters(visibility, window) as { workspaceId: number; $and: unknown[] };

  assert.equal(merged.workspaceId, 1);
  assert.equal(merged.$and.length, 2);
  assert.deepEqual(merged.$and[0], visibility.$and[0]);
  assert.deepEqual(merged.$and[1], window.$and[0]);
});

test("a naive spread would have lost a clause", () => {
  const a = { $and: [{ x: 1 }] };
  const b = { $and: [{ y: 2 }] };
  assert.equal(({ ...a, ...b }).$and.length, 1);
  assert.equal((andFilters(a, b).$and as unknown[]).length, 2);
});

test("filters without $and merge as plain keys", () => {
  assert.deepEqual(andFilters({ a: 1 }, { b: 2 }), { a: 1, b: 2 });
});

test("andFilters merges visibility, assignee 'me' filter and window filters together", () => {
  const filter = {
    workspaceId: { $in: ["ws1"] },
    $and: [
      { $or: [{ visibility: "WORKSPACE" }, { creatorId: "u1" }, { assigneeId: "u1" }] },
      { $or: [{ assigneeId: "u1" }, { creatorId: "u1", assigneeId: null }] },
    ],
  };
  const window = { $and: [{ $or: [{ startAt: { $lte: "to" } }] }] };

  const merged = andFilters(filter, window) as { workspaceId: { $in: string[] }; $and: unknown[] };
  assert.equal(merged.$and.length, 3);
  assert.deepEqual(merged.$and[0], filter.$and[0]);
  assert.deepEqual(merged.$and[1], filter.$and[1]);
  assert.deepEqual(merged.$and[2], window.$and[0]);
});
