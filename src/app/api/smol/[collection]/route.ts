import { fail, handleError, ok, parseBody, parseQuery } from "@/lib/api";
import { isSmolCollection } from "@/lib/smol-config";
import { assertCanRead, listSmol, requireAdmin, smolFilterOptions, smolListQuery } from "@/server/smol";
import { announcementInput, createAnnouncement } from "@/server/smol-admin";

export async function GET(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  try {
    const user = await requireAdmin();
    const { collection } = await params;
    if (!isSmolCollection(collection)) return fail("Unknown collection", "NOT_FOUND", 404);
    assertCanRead(user, collection);
    if (new URL(request.url).searchParams.has("options")) return ok(await smolFilterOptions(collection, user.role));
    return ok(await listSmol(collection, parseQuery(request, smolListQuery), user.role));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  try {
    await requireAdmin("superadmin");
    const { collection } = await params;
    if (collection !== "announcements") return fail("Not supported", "NOT_FOUND", 404);
    return ok(await createAnnouncement(await parseBody(request, announcementInput)), 201);
  } catch (error) {
    return handleError(error);
  }
}
