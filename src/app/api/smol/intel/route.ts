import { handleError, ok, parseQuery } from "@/lib/api";
import { requireSmolAdmin, smolIntel, smolIntelQuery } from "@/server/smol";

export async function GET(request: Request) {
  try {
    await requireSmolAdmin();
    return ok(await smolIntel(parseQuery(request, smolIntelQuery)));
  } catch (error) {
    return handleError(error);
  }
}
