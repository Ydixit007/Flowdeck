import { handleError, ok } from "@/lib/api";
import { requireAdmin, smolMeta } from "@/server/smol";

export async function GET() {
  try {
    const user = await requireAdmin();
    return ok(await smolMeta(user.role));
  } catch (error) {
    return handleError(error);
  }
}
