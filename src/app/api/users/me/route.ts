import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { updateProfileSchema } from "@/lib/validation";
import { User } from "@/models/User";
import { toPublicUser } from "@/server/users";
import { resolveTimezone } from "@/lib/tz";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ user: toPublicUser(user) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, updateProfileSchema);
    await connectDB();

    if (input.username && input.username !== user.username) {
      const taken = await User.exists({ username: input.username, _id: { $ne: user._id } });
      if (taken) return fail("That username is taken", "DUPLICATE", 409, { field: "username" });
    }

    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.username !== undefined) update.username = input.username;
    if (input.bio !== undefined) update.bio = input.bio;
    if (input.avatar !== undefined) update.avatar = input.avatar;
    if (input.timezone !== undefined) update.timezone = resolveTimezone(input.timezone);

    const updated = await User.findByIdAndUpdate(user._id, { $set: update }, { new: true }).lean();
    if (!updated) return fail("User not found", "NOT_FOUND", 404);
    return ok({ user: toPublicUser(updated) });
  } catch (error) {
    return handleError(error);
  }
}
