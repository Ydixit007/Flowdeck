import { fail, handleError, ok, parseQuery } from "@/lib/api";
import { requireSmolAdmin } from "@/server/smol";
import { posthogConfigured, smolAnalytics, smolAnalyticsQuery } from "@/server/smol-posthog";

export async function GET(request: Request) {
  try {
    await requireSmolAdmin();
    if (!posthogConfigured()) return ok({ configured: false as const });
    const query = parseQuery(request, smolAnalyticsQuery);
    try {
      return ok({ configured: true as const, ...(await smolAnalytics(query)) });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "PostHog unavailable", "UPSTREAM_ERROR", 502);
    }
  } catch (error) {
    return handleError(error);
  }
}
