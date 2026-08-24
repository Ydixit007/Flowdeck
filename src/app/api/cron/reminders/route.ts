import type { NextRequest } from "next/server";
import { fail, handleError, ok } from "@/lib/api";
import { runReminderSweep } from "@/server/reminders";

export const dynamic = "force-dynamic";

/** Invoked by a scheduler (Vercel cron, systemd timer, GitHub Action).
 *  Protected by a shared secret rather than a user session. */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return fail("CRON_SECRET is not configured", "NOT_CONFIGURED", 503);
    const provided =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      new URL(request.url).searchParams.get("secret");
    if (provided !== secret) return fail("Invalid cron secret", "UNAUTHORIZED", 401);

    const result = await runReminderSweep();
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
