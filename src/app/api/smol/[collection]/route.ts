import { fail, handleError, ok, parseQuery } from "@/lib/api";
import { isSmolCollection } from "@/lib/smol-config";
import { listSmol, requireSmolAdmin, smolFilterOptions, smolListQuery } from "@/server/smol";

export async function GET(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  try {
    await requireSmolAdmin();
    const { collection } = await params;
    if (!isSmolCollection(collection)) return fail("Unknown collection", "NOT_FOUND", 404);
    if (new URL(request.url).searchParams.has("options")) return ok(await smolFilterOptions(collection));
    return ok(await listSmol(collection, parseQuery(request, smolListQuery)));
  } catch (error) {
    return handleError(error);
  }
}
