import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody } from "@/lib/api";
import { parseTextSchema } from "@/lib/validation";
import { parseTaskText } from "@/lib/nlp";
import { fromWallClock, resolveTimezone, toWallClock } from "@/lib/tz";

/**
 * Parses free text into task fields. Chrono works in the server's local zone,
 * so the reference instant is shifted to the user's wall clock and the results
 * are shifted back — otherwise "tomorrow at 10am" lands in the wrong hour.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, parseTextSchema);
    const timezone = resolveTimezone(input.timezone ?? user.timezone);

    const now = new Date();
    const userWall = toWallClock(now, timezone);
    const reference = new Date(
      userWall.year,
      userWall.month - 1,
      userWall.day,
      userWall.hour,
      userWall.minute,
    );

    const parsed = parseTaskText(input.text, reference);

    const toUtc = (local: Date | null): string | null => {
      if (!local) return null;
      return fromWallClock(
        {
          year: local.getFullYear(),
          month: local.getMonth() + 1,
          day: local.getDate(),
          hour: local.getHours(),
          minute: local.getMinutes(),
        },
        timezone,
      ).toISOString();
    };

    return ok({
      parsed: {
        ...parsed,
        startAt: toUtc(parsed.startAt),
        dueAt: toUtc(parsed.dueAt),
        recurrence: parsed.recurrence
          ? { ...parsed.recurrence, until: parsed.recurrence.until ?? null }
          : null,
      },
      timezone,
    });
  } catch (error) {
    return handleError(error);
  }
}
