/** Loose equality for stored values: dates compare by instant, ObjectIds and
 *  arrays by their string form, so "same value re-sent" is not a change.
 *  Used to keep no-op edits out of the activity log. */
export function sameValue(next: unknown, current: unknown): boolean {
  if (next === current) return true;
  if (next == null || current == null) return next == null && current == null;
  if (next instanceof Date || current instanceof Date) {
    const a = next instanceof Date ? next.getTime() : new Date(next as string).getTime();
    const b = current instanceof Date ? current.getTime() : new Date(current as string).getTime();
    return a === b;
  }
  if (typeof next === "object" || typeof current === "object") {
    return JSON.stringify(next) === JSON.stringify(current);
  }
  return String(next) === String(current);
}
