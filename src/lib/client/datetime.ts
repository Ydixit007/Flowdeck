"use client";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Datetime inputs speak wall-clock strings with no zone. These two helpers are
 * the only bridge between a UTC instant and an <input> value, so every form
 * renders in the user's configured timezone rather than the browser's.
 */
export function localInputValue(instant: Date, timeZone: string, dateOnly = false): string {
  return formatInTimeZone(instant, timeZone, dateOnly ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm");
}

export function parseLocalInput(value: string, timeZone: string, dateOnly = false): Date {
  const normalized = dateOnly ? `${value.slice(0, 10)}T00:00:00` : `${value}:00`;
  return fromZonedTime(normalized, timeZone);
}

export function formatInUserTz(instant: Date | string, timeZone: string, pattern: string): string {
  return formatInTimeZone(typeof instant === "string" ? new Date(instant) : instant, timeZone, pattern);
}

/** Local timezone as reported by the browser, used to seed a new account. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
