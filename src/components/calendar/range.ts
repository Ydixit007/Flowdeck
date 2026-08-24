import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export type CalendarView = "day" | "week" | "fifteen" | "month";

export const VIEW_LABELS: Record<CalendarView, string> = {
  day: "Today",
  week: "This Week",
  fifteen: "15 Days",
  month: "This Month",
};

export interface CalendarRange {
  /** Inclusive list of days rendered, each a UTC instant at local midnight. */
  days: Date[];
  from: Date;
  to: Date;
  title: string;
}

/** Local midnight for the calendar day containing `instant`, as a UTC instant. */
export function dayStart(instant: Date, timeZone: string): Date {
  return fromZonedTime(`${formatInTimeZone(instant, timeZone, "yyyy-MM-dd")}T00:00:00`, timeZone);
}

/** Wall-clock date object in the target zone; safe for date-fns day math. */
function zoned(instant: Date, timeZone: string): Date {
  return toZonedTime(instant, timeZone);
}

function backToUtc(wall: Date, timeZone: string): Date {
  const iso = `${wall.getFullYear()}-${String(wall.getMonth() + 1).padStart(2, "0")}-${String(
    wall.getDate(),
  ).padStart(2, "0")}T00:00:00`;
  return fromZonedTime(iso, timeZone);
}

/**
 * Builds the visible range for a view. All arithmetic runs on wall-clock dates
 * in the user's timezone and is converted back to instants, so a week boundary
 * is the user's midnight rather than the server's.
 */
export function buildRange(view: CalendarView, anchor: Date, timeZone: string): CalendarRange {
  const wallAnchor = zoned(anchor, timeZone);

  const build = (startWall: Date, count: number): Date[] =>
    Array.from({ length: count }, (_, index) => backToUtc(addDays(startWall, index), timeZone));

  switch (view) {
    case "day": {
      const days = build(wallAnchor, 1);
      return {
        days,
        from: days[0] as Date,
        to: addDays24(days[0] as Date),
        title: formatInTimeZone(anchor, timeZone, "EEEE d MMMM yyyy"),
      };
    }
    case "week": {
      const start = startOfWeek(wallAnchor, { weekStartsOn: 1 });
      const days = build(start, 7);
      const last = days[6] as Date;
      return {
        days,
        from: days[0] as Date,
        to: addDays24(last),
        title: `${formatInTimeZone(days[0] as Date, timeZone, "d MMM")} – ${formatInTimeZone(last, timeZone, "d MMM yyyy")}`,
      };
    }
    case "fifteen": {
      const days = build(wallAnchor, 15);
      const last = days[14] as Date;
      return {
        days,
        from: days[0] as Date,
        to: addDays24(last),
        title: `${formatInTimeZone(days[0] as Date, timeZone, "d MMM")} – ${formatInTimeZone(last, timeZone, "d MMM yyyy")}`,
      };
    }
    case "month": {
      // Full weeks so the month grid never has ragged edges.
      const gridStart = startOfWeek(startOfMonth(wallAnchor), { weekStartsOn: 1 });
      const gridEnd = endOfWeek(endOfMonth(wallAnchor), { weekStartsOn: 1 });
      const count = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
      const days = build(gridStart, count);
      return {
        days,
        from: days[0] as Date,
        to: addDays24(days[days.length - 1] as Date),
        title: formatInTimeZone(anchor, timeZone, "MMMM yyyy"),
      };
    }
  }
}

function addDays24(instant: Date): Date {
  return new Date(instant.getTime() + 86_400_000 - 1);
}

export function shiftAnchor(view: CalendarView, anchor: Date, direction: 1 | -1, timeZone: string): Date {
  const wall = zoned(anchor, timeZone);
  switch (view) {
    case "day":
      return backToUtc(addDays(wall, direction), timeZone);
    case "week":
      return backToUtc(addDays(wall, 7 * direction), timeZone);
    case "fifteen":
      return backToUtc(addDays(wall, 15 * direction), timeZone);
    case "month":
      return backToUtc(startOfMonth(addMonths(wall, direction)), timeZone);
  }
}

export function isToday(day: Date, timeZone: string): boolean {
  return (
    formatInTimeZone(day, timeZone, "yyyy-MM-dd") === formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd")
  );
}

export function dayKey(instant: Date | string, timeZone: string): string {
  return formatInTimeZone(typeof instant === "string" ? new Date(instant) : instant, timeZone, "yyyy-MM-dd");
}
