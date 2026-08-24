import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/** Wall-clock parts of an instant as seen in a timezone. */
export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

export function toWallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatInTimeZone(instant, timeZone, "yyyy-MM-dd-HH-mm").split("-");
  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
    hour: Number(parts[3]),
    minute: Number(parts[4]),
  };
}

/** Builds the UTC instant for a wall-clock time in a timezone (DST-aware). */
export function fromWallClock(wall: WallClock, timeZone: string): Date {
  const iso =
    `${String(wall.year).padStart(4, "0")}-${String(wall.month).padStart(2, "0")}-` +
    `${String(wall.day).padStart(2, "0")}T${String(wall.hour).padStart(2, "0")}:` +
    `${String(wall.minute).padStart(2, "0")}:00`;
  return fromZonedTime(iso, timeZone);
}

/** Start of the given day (in tz) as a UTC instant. */
export function startOfDayInTz(instant: Date, timeZone: string): Date {
  const wall = toWallClock(instant, timeZone);
  return fromWallClock({ ...wall, hour: 0, minute: 0 }, timeZone);
}

export function addDaysInTz(instant: Date, days: number, timeZone: string): Date {
  const wall = toWallClock(instant, timeZone);
  // Day arithmetic on the wall-clock date, then re-resolve the offset.
  const utcNoon = Date.UTC(wall.year, wall.month - 1, wall.day + days, 12);
  const shifted = new Date(utcNoon);
  return fromWallClock(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: wall.hour,
      minute: wall.minute,
    },
    timeZone,
  );
}

/** 0 = Sunday, matching Date#getDay, evaluated in the target timezone. */
export function weekdayInTz(instant: Date, timeZone: string): number {
  return toZonedTime(instant, timeZone).getDay();
}

export function isSameDayInTz(a: Date, b: Date, timeZone: string): boolean {
  return (
    formatInTimeZone(a, timeZone, "yyyy-MM-dd") === formatInTimeZone(b, timeZone, "yyyy-MM-dd")
  );
}

export function formatTz(instant: Date, timeZone: string, pattern: string): string {
  return formatInTimeZone(instant, timeZone, pattern);
}

export function resolveTimezone(candidate?: string | null): string {
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}
