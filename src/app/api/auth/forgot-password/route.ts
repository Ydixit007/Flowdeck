import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { createResetToken } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validation";
import { User } from "@/models/User";

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(clientKey(request, "forgot"), 5, 60 * 60 * 1000);
    if (!limit.allowed) return fail("Too many requests", "RATE_LIMITED", 429);

    const { email } = await parseBody(request, forgotPasswordSchema);
    await connectDB();
    const user = await User.findOne({ email }).select("_id").lean();

    // Always report success so the endpoint cannot enumerate accounts.
    if (!user) return ok({ sent: true });

    const { token, tokenHash, expiresAt } = createResetToken();
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt } },
    );

    // No mail transport is configured; the link is logged for local development
    // and returned only outside production.
    const link = `/reset-password?token=${token}`;
    console.info(`[auth] password reset link for ${email}: ${link}`);
    return ok(process.env.NODE_ENV === "production" ? { sent: true } : { sent: true, devLink: link });
  } catch (error) {
    return handleError(error);
  }
}
