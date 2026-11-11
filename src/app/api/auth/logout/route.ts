import { NextResponse } from "next/server";
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

/** Stale-session exit: a cookie whose epoch was bumped still passes middleware, so clear it or /login bounces back forever. */
export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url));
}
