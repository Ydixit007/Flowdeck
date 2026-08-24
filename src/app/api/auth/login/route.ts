import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { User } from "@/models/User";

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(clientKey(request, "login"), 10, 10 * 60 * 1000);
    if (!limit.allowed) {
      return fail("Too many login attempts. Try again shortly.", "RATE_LIMITED", 429);
    }

    const { email, password } = await parseBody(request, loginSchema);
    await connectDB();

    const user = await User.findOne({ email }).select("+passwordHash sessionEpoch").lean();
    // Same response either way so the endpoint cannot enumerate accounts.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return fail("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    await createSession(user._id.toString(), user.sessionEpoch ?? 0);
    await User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } });
    return ok({ id: user._id.toString() });
  } catch (error) {
    return handleError(error);
  }
}
