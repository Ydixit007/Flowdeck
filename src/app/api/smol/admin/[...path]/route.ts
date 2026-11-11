import { fail, handleError, ok } from "@/lib/api";
import { requireAdmin } from "@/server/smol";
import { ADMIN_API_PATH, adminApi } from "@/server/smol-admin";

type Ctx = { params: Promise<{ path: string[] }> };

/** Superadmin passthrough to the backend admin API (seller, order, OTP and email controls); the caller's email is the audit `by`. */
async function proxy(request: Request, { params }: Ctx, method: "GET" | "POST") {
  try {
    const user = await requireAdmin("superadmin");
    const path = (await params).path.join("/");
    if (!ADMIN_API_PATH.test(path)) return fail("Not supported", "NOT_FOUND", 404);
    const body = method === "POST" ? await request.json().catch(() => ({})) : undefined;
    const result = await adminApi(path, { method, search: new URL(request.url).search, body, by: user.email });
    return result.status === 200 ? ok(result.data) : fail(result.message, "BACKEND_REJECTED", result.status);
  } catch (error) {
    return handleError(error);
  }
}

export const GET = (request: Request, ctx: Ctx) => proxy(request, ctx, "GET");
export const POST = (request: Request, ctx: Ctx) => proxy(request, ctx, "POST");
