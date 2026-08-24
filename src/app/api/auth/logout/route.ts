import { destroySession } from "@/lib/auth";
import { handleError, ok } from "@/lib/api";

export async function POST() {
  try {
    await destroySession();
    return ok({ done: true });
  } catch (error) {
    return handleError(error);
  }
}
