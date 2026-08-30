/** How late a fire time may be and still send. Longer than the client poll
 *  interval so a tab hidden for a minute does not silently drop a reminder. */
export const REMINDER_GRACE_MS = 15 * 60 * 1000;

/**
 * True when an occurrence has started but is still inside the grace window.
 * A start older than the grace window belongs to a poll that never ran, and
 * announcing it would report something that began long ago.
 */
export function shouldFire(occurrence: Date, now: Date): boolean {
  const lateBy = now.getTime() - occurrence.getTime();
  return lateBy >= 0 && lateBy <= REMINDER_GRACE_MS;
}
