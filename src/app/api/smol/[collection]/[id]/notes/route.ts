import { fail, handleError, ok, parseBody } from "@/lib/api";
import { requireAdmin, toPlain } from "@/server/smol";
import { sellerNotesInput, updateSellerNotes } from "@/server/smol-admin";

/** Sellers only: add, edit or delete an internal note, or replace the tags (superadmin). */
export async function POST(request: Request, { params }: { params: Promise<{ collection: string; id: string }> }) {
  try {
    const user = await requireAdmin("superadmin");
    const { collection, id } = await params;
    if (collection !== "stores" || !/^[a-f\d]{24}$/i.test(id)) return fail("Not supported", "NOT_FOUND", 404);
    return ok(toPlain(await updateSellerNotes(id, await parseBody(request, sellerNotesInput), user.email)));
  } catch (error) {
    return handleError(error);
  }
}
