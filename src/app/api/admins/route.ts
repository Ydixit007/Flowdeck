import { handleError, ok, parseBody } from "@/lib/api";
import { inviteAdminSchema } from "@/lib/validation";
import { inviteAdmin, listAdmins } from "@/server/admins";
import { requireAdmin } from "@/server/smol";

export async function GET() {
  try {
    await requireAdmin("superadmin");
    return ok(await listAdmins());
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin("superadmin");
    return ok(await inviteAdmin(await parseBody(request, inviteAdminSchema)), 201);
  } catch (error) {
    return handleError(error);
  }
}
