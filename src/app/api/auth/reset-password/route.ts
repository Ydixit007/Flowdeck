import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { hashPassword, hashResetToken } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/lib/validation";
import { User } from "@/models/User";

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(clientKey(request, "reset"), 10, 60 * 60 * 1000);
    if (!limit.allowed) return fail("Too many requests", "RATE_LIMITED", 429);

    const { token, password } = await parseBody(request, resetPasswordSchema);
    await connectDB();

    const user = await User.findOne({
      passwordResetTokenHash: hashResetToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
    })
      .select("_id sessionEpoch")
      .lean();
    if (!user) return fail("This reset link is invalid or expired", "INVALID_TOKEN", 400);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: await hashPassword(password),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
        // Bumping the epoch signs out every existing session.
        $inc: { sessionEpoch: 1 },
      },
    );

    return ok({ reset: true });
  } catch (error) {
    return handleError(error);
  }
}
