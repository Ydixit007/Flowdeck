import test from "node:test";
import assert from "node:assert/strict";
import { taskQuerySchema, updateProjectSchema, updateTaskSchema } from "@/lib/validation";

// A PATCH must touch only what it names: `.partial()` alone leaves each
// field's `.default()` live, which silently reset project icon/colour.
test("patching project status leaves icon and colour untouched", () => {
  const parsed = updateProjectSchema.parse({ status: "ARCHIVED" });
  assert.deepEqual(parsed, { status: "ARCHIVED" });
  assert.ok(!("icon" in parsed));
  assert.ok(!("color" in parsed));
});

test("patching a project icon still passes it through", () => {
  assert.deepEqual(updateProjectSchema.parse({ icon: "Rocket", color: "#ff00aa" }), {
    icon: "Rocket",
    color: "#ff00aa",
  });
});

test("patching task status leaves priority, allDay and visibility untouched", () => {
  const parsed = updateTaskSchema.parse({ status: "DONE" });
  assert.equal(parsed.status, "DONE");
  for (const key of ["priority", "allDay", "visibility", "tagIds", "isContent"]) {
    assert.ok(!(key in parsed), `${key} must not be injected`);
  }
});

test("scope keeps its default: every task edit needs one", () => {
  assert.equal(updateTaskSchema.parse({ status: "DONE" }).scope, "SERIES");
});

test("taskQuerySchema parses includeUnscheduled correctly", () => {
  const parsed = taskQuerySchema.parse({
    workspaceId: "507f1f77bcf86cd799439011",
    includeUnscheduled: "true",
  });
  assert.equal(parsed.includeUnscheduled, "true");
});
