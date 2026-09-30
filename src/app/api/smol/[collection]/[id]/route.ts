import { fail, handleError, ok } from "@/lib/api";
import { isSmolCollection } from "@/lib/smol-config";
import { getSmolDoc, requireSmolAdmin } from "@/server/smol";

export async function GET(_request: Request, { params }: { params: Promise<{ collection: string; id: string }> }) {
  try {
    await requireSmolAdmin();
    const { collection, id } = await params;
    if (!isSmolCollection(collection)) return fail("Unknown collection", "NOT_FOUND", 404);
    return ok(await getSmolDoc(collection, id));
  } catch (error) {
    return handleError(error);
  }
}
