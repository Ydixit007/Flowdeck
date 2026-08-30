import { test } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { sameValue } from "./diff";

test("identical primitives are not a change", () => {
  assert.equal(sameValue("TODO", "TODO"), true);
  assert.equal(sameValue(30, 30), true);
  assert.equal(sameValue(true, true), true);
});

test("different primitives are a change", () => {
  assert.equal(sameValue("DONE", "TODO"), false);
  assert.equal(sameValue(45, 30), false);
});

test("null and undefined both mean 'unset'", () => {
  assert.equal(sameValue(null, undefined), true);
  assert.equal(sameValue(null, null), true);
  assert.equal(sameValue(null, "TODO"), false);
  assert.equal(sameValue("TODO", null), false);
});

test("dates compare by instant, not identity", () => {
  const iso = "2026-03-01T10:00:00.000Z";
  assert.equal(sameValue(new Date(iso), new Date(iso)), true);
  assert.equal(sameValue(iso, new Date(iso)), true, "string re-sent for a stored Date is not a change");
  assert.equal(sameValue(new Date("2026-03-01T11:00:00.000Z"), new Date(iso)), false);
});

test("ObjectIds compare by value", () => {
  const id = new Types.ObjectId();
  assert.equal(sameValue(id.toString(), id), true, "client sends the id as a string");
  assert.equal(sameValue(new Types.ObjectId(), id), false);
});

test("arrays and objects compare structurally", () => {
  assert.equal(sameValue(["a", "b"], ["a", "b"]), true);
  assert.equal(sameValue(["a"], ["a", "b"]), false);
  assert.equal(sameValue({ platform: "X" }, { platform: "X" }), true);
});
