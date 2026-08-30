import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/auth";

export interface ApiError {
  error: { message: string; code: string; details?: unknown };
}

export function ok<T>(data: T, status = 200): NextResponse<{ data: T }> {
  return NextResponse.json({ data }, { status });
}

export function fail(message: string, code: string, status: number, details?: unknown): NextResponse<ApiError> {
  return NextResponse.json({ error: { message, code, details } }, { status });
}

/** Maps thrown errors to consistent HTTP responses. Wrap every route handler. */
export function handleError(error: unknown): NextResponse<ApiError> {
  if (error instanceof ZodError) {
    return fail("Validation failed", "VALIDATION_ERROR", 422, error.flatten());
  }
  if (error instanceof UnauthorizedError) return fail(error.message, "UNAUTHORIZED", 401);
  if (error instanceof ForbiddenError) return fail(error.message, "FORBIDDEN", 403);
  if (error instanceof NotFoundError) return fail(error.message, "NOT_FOUND", 404);
  if (error instanceof Error) {
    const isDuplicate = "code" in error && (error as { code?: number }).code === 11000;
    if (isDuplicate) return fail("Already exists", "DUPLICATE", 409);
    console.error("[api]", error);
    return fail(error.message || "Server error", "SERVER_ERROR", 500);
  }
  console.error("[api] unknown error", error);
  return fail("Server error", "SERVER_ERROR", 500);
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  return schema.parse(raw);
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const url = new URL(request.url);
  const entries: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    entries[key] = all.length > 1 ? all : (all[0] as string);
  }
  return schema.parse(entries);
}

/** Next passes dynamic segments as a promise; every `[id]` route shares this. */
export interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Reads a required ObjectId query param, rejecting anything Mongo would
 *  choke on with a 422 rather than a cast error. */
export function requireIdParam(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name);
  if (!value || !/^[a-f\d]{24}$/i.test(value)) {
    throw new ZodError([{ code: "custom", path: [name], message: `${name} is required` }]);
  }
  return value;
}
