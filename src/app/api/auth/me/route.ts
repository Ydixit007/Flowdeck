import { getCurrentUser } from "@/lib/auth";
import { handleError, ok } from "@/lib/api";
import { toPublicUser } from "@/server/users";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return ok({ user: user ? toPublicUser(user) : null });
  } catch (error) {
    return handleError(error);
  }
}
