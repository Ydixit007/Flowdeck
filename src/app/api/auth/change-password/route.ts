import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { createSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation";
import { User } from "@/models/User";

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireUser();
    const { currentPassword, newPassword } = await parseBody(request, changePasswordSchema);
    await connectDB();

    const user = await User.findById(authUser._id).select("+passwordHash sessionEpoch").lean();
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return fail("Current password is incorrect", "INVALID_CREDENTIALS", 400);
    }

    const nextEpoch = (user.sessionEpoch ?? 0) + 1;
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(newPassword), sessionEpoch: nextEpoch } },
    );
    // Keep the current device signed in, drop every other session.
    await createSession(user._id.toString(), nextEpoch);
    return ok({ changed: true });
  } catch (error) {
    return handleError(error);
  }
}
