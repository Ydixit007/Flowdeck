import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskText } from "@/lib/nlp";

// Fixed reference: Monday 2026-03-02 09:00 local.
const REF = new Date("2026-03-02T09:00:00");

test("parses title, date, time and duration", () => {
  const parsed = parseTaskText("Build auth API tomorrow at 10am for 2 hours", REF);
  assert.equal(parsed.title, "Build auth API");
  assert.equal(parsed.estimatedMinutes, 120);
  assert.equal(parsed.startAt?.getDate(), 3);
  assert.equal(parsed.startAt?.getHours(), 10);
  assert.equal(parsed.dueAt?.getHours(), 12);
  assert.equal(parsed.allDay, false);
});

test("parses weekly recurrence with time", () => {
  const parsed = parseTaskText("Post LinkedIn content every Tuesday at 7pm", REF);
  assert.equal(parsed.title, "Post LinkedIn content");
  assert.equal(parsed.recurrence?.freq, "WEEKLY");
  assert.deepEqual(parsed.recurrence?.byWeekday, [2]);
  assert.equal(parsed.startAt?.getHours(), 19);
});

test("parses multi-day recurrence", () => {
  const parsed = parseTaskText("Workout every Monday, Wednesday and Friday", REF);
  assert.equal(parsed.title, "Workout");
  assert.deepEqual(parsed.recurrence?.byWeekday, [1, 3, 5]);
});

test("parses monthly day-of-month recurrence", () => {
  const parsed = parseTaskText("Pay subscription on the 1st of every month", REF);
  assert.equal(parsed.recurrence?.freq, "MONTHLY");
  assert.equal(parsed.recurrence?.byMonthDay, 1);
  assert.equal(parsed.title, "Pay subscription");
});

test("parses a bare weekday as an all-day task", () => {
  const parsed = parseTaskText("Review analytics Friday", REF);
  assert.equal(parsed.title, "Review analytics");
  assert.equal(parsed.allDay, true);
  assert.equal(parsed.startAt?.getDay(), 5);
});

test("extracts tags, project and priority markers", () => {
  const parsed = parseTaskText("Fix login bug #backend #bug +Flowdeck !urgent", REF);
  assert.equal(parsed.title, "Fix login bug");
  assert.deepEqual(parsed.tagNames, ["backend", "bug"]);
  assert.equal(parsed.projectName, "Flowdeck");
  assert.equal(parsed.priority, "URGENT");
});

test("natural priority wording is understood", () => {
  const parsed = parseTaskText("Ship release notes asap", REF);
  assert.equal(parsed.priority, "URGENT");
  assert.equal(parsed.title, "Ship release notes");
});

test("unscheduled input stays unscheduled without complaining", () => {
  const parsed = parseTaskText("Maybe make a video about Next.js caching", REF);
  assert.equal(parsed.startAt, null);
  assert.equal(parsed.recurrence, null);
  assert.deepEqual(parsed.clarifications, []);
});

test("two competing dates ask for clarification instead of guessing", () => {
  const parsed = parseTaskText("Sync notes Tuesday or Thursday", REF);
  assert.ok(parsed.clarifications.length > 0);
});

test("duration without a start time asks for the time", () => {
  const parsed = parseTaskText("Deep work Friday for 3 hours", REF);
  assert.ok(parsed.clarifications.some((c) => c.includes("What time")));
});

test("every-N-weeks recurrence keeps the interval", () => {
  const parsed = parseTaskText("Sprint planning every 2 weeks", REF);
  assert.equal(parsed.recurrence?.freq, "WEEKLY");
  assert.equal(parsed.recurrence?.interval, 2);
});

test("weekday recurrence", () => {
  const parsed = parseTaskText("Standup every weekday at 9:30am", REF);
  assert.equal(parsed.recurrence?.freq, "WEEKDAYS");
  assert.equal(parsed.startAt?.getHours(), 9);
  assert.equal(parsed.startAt?.getMinutes(), 30);
});
