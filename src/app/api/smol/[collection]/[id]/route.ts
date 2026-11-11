import { z } from "zod";
import { fail, handleError, ok, parseBody, parseQuery } from "@/lib/api";
import { SMOL_RESOLVABLE, isSmolCollection } from "@/lib/smol-config";
import { assertCanRead, getSmolDoc, requireAdmin } from "@/server/smol";
import { announcementInput, deleteSeller, setResolved, updateAnnouncement } from "@/server/smol-admin";

export async function GET(_request: Request, { params }: { params: Promise<{ collection: string; id: string }> }) {
  try {
    const user = await requireAdmin();
    const { collection, id } = await params;
    if (!isSmolCollection(collection)) return fail("Unknown collection", "NOT_FOUND", 404);
    assertCanRead(user, collection);
    return ok(await getSmolDoc(collection, id, user.role));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ collection: string; id: string }> }) {
  try {
    await requireAdmin("superadmin");
    const { collection, id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return fail("Not supported", "NOT_FOUND", 404);
    // Announcements: edit any field or flip `published` (SMOL-416).
    if (collection === "announcements") return ok(await updateAnnouncement(id, await parseBody(request, announcementInput.partial())));
    if (!isSmolCollection(collection) || !SMOL_RESOLVABLE.has(collection)) return fail("Not supported", "NOT_FOUND", 404);
    const body = await parseBody(request, z.object({ resolved: z.boolean() }));
    return ok(await setResolved(collection, id, body.resolved));
  } catch (error) {
    return handleError(error);
  }
}

/** Sellers only: wipes the store, its files and every row tied to it. `?confirm=<domain>` guards against misfires. */
export async function DELETE(request: Request, { params }: { params: Promise<{ collection: string; id: string }> }) {
  try {
    await requireAdmin("superadmin");
    const { collection, id } = await params;
    if (collection !== "stores" || !/^[a-f\d]{24}$/i.test(id)) return fail("Not supported", "NOT_FOUND", 404);
    const { confirm } = parseQuery(request, z.object({ confirm: z.string().min(1) }));
    return ok(await deleteSeller(id, confirm));
  } catch (error) {
    return handleError(error);
  }
}
