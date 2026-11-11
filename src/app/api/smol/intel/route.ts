import { handleError, ok, parseQuery } from "@/lib/api";
import { requireAdmin, smolIntel, smolIntelQuery } from "@/server/smol";

export async function GET(request: Request) {
  try {
    await requireAdmin("superadmin");
    return ok(await smolIntel(parseQuery(request, smolIntelQuery)));
  } catch (error) {
    return handleError(error);
  }
}
