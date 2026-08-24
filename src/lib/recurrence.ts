import type { RecurrenceRule } from "@/models/Task";
import { addDaysInTz, fromWallClock, toWallClock, weekdayInTz } from "@/lib/tz";

const MAX_OCCURRENCES = 500;
const MAX_ITERATIONS = 5000;

export interface OccurrenceWindow {
  from: Date;
  to: Date;
}

/**
 * Expands a recurrence rule into concrete start instants inside a window.
 *
 * The series anchor (`seriesStart`) supplies the time-of-day, and all stepping
 * happens on wall-clock dates in `timeZone` so a 9am task stays 9am across DST
 * transitions. Nothing is persisted — occurrences are derived on read.
 */
export function expandOccurrences(
  seriesStart: Date,
  rule: RecurrenceRule,
  window: OccurrenceWindow,
  timeZone: string,
): Date[] {
  const results: Date[] = [];
  const until = rule.until ? new Date(rule.until) : null;
  const hardStop = until && until < window.to ? until : window.to;
  const interval = Math.max(1, rule.interval || 1);
  const anchor = toWallClock(seriesStart, timeZone);

  let emitted = 0;
  let iterations = 0;

  const sorted = (): Date[] => results.sort((a, b) => a.getTime() - b.getTime());

  const push = (instant: Date): boolean => {
    if (instant < seriesStart) return true;
    if (instant > hardStop) return false;
    if (instant >= window.from) results.push(instant);
    emitted += 1;
    if (rule.count && emitted >= rule.count) return false;
    return results.length < MAX_OCCURRENCES;
  };

  const emitDaily = (step: number, weekdayFilter?: number[]): void => {
    // Jump straight to the first candidate at/after the window to avoid walking
    // years of history for an old series.
    let cursor = seriesStart;
    if (window.from > seriesStart && !rule.count) {
      const dayDiff = Math.floor((window.from.getTime() - seriesStart.getTime()) / 86_400_000);
      const skips = Math.max(0, Math.floor(dayDiff / step) - 1);
      if (skips > 0) cursor = addDaysInTz(seriesStart, skips * step, timeZone);
    }
    while (iterations++ < MAX_ITERATIONS) {
      if (cursor > hardStop) return;
      const matches = !weekdayFilter || weekdayFilter.includes(weekdayInTz(cursor, timeZone));
      if (matches && !push(cursor)) return;
      cursor = addDaysInTz(cursor, step, timeZone);
    }
  };

  switch (rule.freq) {
    case "DAILY":
      emitDaily(interval);
      break;

    case "WEEKDAYS":
      emitDaily(1, [1, 2, 3, 4, 5]);
      break;

    case "WEEKLY":
    case "BIWEEKLY":
    case "CUSTOM": {
      const weekStep = rule.freq === "BIWEEKLY" ? 2 : interval;
      const weekdays =
        rule.byWeekday && rule.byWeekday.length > 0
          ? [...new Set(rule.byWeekday)].sort((a, b) => a - b)
          : [weekdayInTz(seriesStart, timeZone)];

      // Walk week by week from the anchor's week start, emitting selected weekdays.
      const anchorWeekday = weekdayInTz(seriesStart, timeZone);
      let weekStart = addDaysInTz(seriesStart, -anchorWeekday, timeZone);
      if (window.from > weekStart && !rule.count) {
        const weeksAway = Math.floor((window.from.getTime() - weekStart.getTime()) / (7 * 86_400_000));
        const skipWeeks = Math.max(0, Math.floor(weeksAway / weekStep) - 1) * weekStep;
        if (skipWeeks > 0) weekStart = addDaysInTz(weekStart, skipWeeks * 7, timeZone);
      }
      while (iterations++ < MAX_ITERATIONS && weekStart <= hardStop) {
        for (const weekday of weekdays) {
          const candidate = addDaysInTz(weekStart, weekday, timeZone);
          if (candidate > hardStop) continue;
          if (candidate >= seriesStart && !push(candidate)) return sorted();
        }
        weekStart = addDaysInTz(weekStart, 7 * weekStep, timeZone);
      }
      break;
    }

    case "MONTHLY": {
      const day = rule.byMonthDay ?? anchor.day;
      let year = anchor.year;
      let month = anchor.month;
      while (iterations++ < MAX_ITERATIONS) {
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        if (day <= daysInMonth) {
          // Days beyond the month length (e.g. 31st in February) are skipped
          // rather than clamped, so "the 31st" never silently becomes the 28th.
          const candidate = fromWallClock(
            { year, month, day, hour: anchor.hour, minute: anchor.minute },
            timeZone,
          );
          if (candidate > hardStop) return sorted();
          if (candidate >= seriesStart && !push(candidate)) return sorted();
        }
        month += interval;
        while (month > 12) {
          month -= 12;
          year += 1;
        }
        if (fromWallClock({ year, month, day: 1, hour: 0, minute: 0 }, timeZone) > hardStop) return sorted();
      }
      break;
    }

    case "YEARLY": {
      const month = rule.byMonth ?? anchor.month;
      const day = rule.byMonthDay ?? anchor.day;
      let year = anchor.year;
      while (iterations++ < MAX_ITERATIONS) {
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        if (day <= daysInMonth) {
          const candidate = fromWallClock(
            { year, month, day, hour: anchor.hour, minute: anchor.minute },
            timeZone,
          );
          if (candidate > hardStop) return sorted();
          if (candidate >= seriesStart && !push(candidate)) return sorted();
        }
        year += interval;
        if (fromWallClock({ year, month: 1, day: 1, hour: 0, minute: 0 }, timeZone) > hardStop) return sorted();
      }
      break;
    }
  }

  return sorted();
}

export function describeRecurrence(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return "Does not repeat";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = (rule.byWeekday ?? []).map((d) => names[d] ?? "?").join(", ");
  const suffix = rule.until ? ` until ${rule.until.toISOString().slice(0, 10)}` : "";
  switch (rule.freq) {
    case "DAILY":
      return (rule.interval > 1 ? `Every ${rule.interval} days` : "Daily") + suffix;
    case "WEEKDAYS":
      return "Every weekday" + suffix;
    case "WEEKLY":
      return (days ? `Weekly on ${days}` : "Weekly") + suffix;
    case "BIWEEKLY":
      return (days ? `Every 2 weeks on ${days}` : "Every 2 weeks") + suffix;
    case "MONTHLY":
      return `Monthly on day ${rule.byMonthDay ?? "—"}` + suffix;
    case "YEARLY":
      return "Yearly" + suffix;
    case "CUSTOM":
      return (days ? `Custom: ${days}` : "Custom") + suffix;
  }
}
