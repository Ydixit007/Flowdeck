import { requireUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/api";
import { runRemindersForUser } from "@/server/reminders";

/**
 * Fires the time-based reminders this user is owed. Driven by the client's
 * notification poll: there is no cron, so an open tab is the clock. Every
 * send is deduped server-side, so calling this often is harmless.
 */
export async function POST() {
  try {
    const user = await requireUser();
    return ok(await runRemindersForUser(user));
  } catch (error) {
    return handleError(error);
  }
}
