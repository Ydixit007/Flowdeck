import { handleError, ok } from "@/lib/api";
import { requireSmolAdmin, smolMeta } from "@/server/smol";

export async function GET() {
  try {
    await requireSmolAdmin();
    return ok(await smolMeta());
  } catch (error) {
    return handleError(error);
  }
}
