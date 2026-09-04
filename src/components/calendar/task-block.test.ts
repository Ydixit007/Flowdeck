import test from "node:test";
import assert from "node:assert/strict";
import { formatTimeRange } from "@/components/calendar/task-block";

test("formatTimeRange formats same-day timed tasks with start and end times", () => {
  const result = formatTimeRange(
    {
      startAt: "2026-09-04T10:00:00.000Z",
      dueAt: "2026-09-04T11:30:00.000Z",
      allDay: false,
    },
    "UTC",
  );
  assert.equal(result.timeLabel, "10:00 – 11:30");
  assert.equal(result.fullTimeLabel, "10:00 to 11:30");
});

test("formatTimeRange defaults to 30m duration if dueAt is omitted", () => {
  const result = formatTimeRange(
    {
      startAt: "2026-09-04T14:00:00.000Z",
      allDay: false,
    },
    "UTC",
  );
  assert.equal(result.timeLabel, "14:00 – 14:30");
});

test("formatTimeRange calculates end time from estimatedMinutes", () => {
  const result = formatTimeRange(
    {
      startAt: "2026-09-04T09:15:00.000Z",
      estimatedMinutes: 45,
      allDay: false,
    },
    "UTC",
  );
  assert.equal(result.timeLabel, "09:15 – 10:00");
});

test("formatTimeRange formats multi-day timed tasks across midnight", () => {
  const result = formatTimeRange(
    {
      startAt: "2026-09-04T23:30:00.000Z",
      dueAt: "2026-09-05T01:00:00.000Z",
      allDay: false,
    },
    "UTC",
  );
  assert.equal(result.timeLabel, "23:30 – 5 Sep 01:00");
});

test("formatTimeRange formats all-day tasks", () => {
  const singleDay = formatTimeRange(
    {
      startAt: "2026-09-04T00:00:00.000Z",
      dueAt: "2026-09-04T00:00:00.000Z",
      allDay: true,
    },
    "UTC",
  );
  assert.equal(singleDay.timeLabel, "All day");

  const multiDay = formatTimeRange(
    {
      startAt: "2026-09-04T00:00:00.000Z",
      dueAt: "2026-09-06T00:00:00.000Z",
      allDay: true,
    },
    "UTC",
  );
  assert.equal(multiDay.timeLabel, "All day (4 Sep – 6 Sep)");
});

