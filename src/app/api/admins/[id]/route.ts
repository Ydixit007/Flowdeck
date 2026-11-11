import { handleError, ok, parseBody, type RouteContext } from "@/lib/api";
import { updateAdminSchema } from "@/lib/validation";
import { removeAdmin, setAdminRole } from "@/server/admins";
import { requireAdmin } from "@/server/smol";

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const actor = await requireAdmin("superadmin");
    const { role } = await parseBody(request, updateAdminSchema);
    return ok(await setAdminRole(actor, (await params).id, role));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const actor = await requireAdmin("superadmin");
    return ok(await removeAdmin(actor, (await params).id));
  } catch (error) {
    return handleError(error);
  }
}
