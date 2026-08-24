import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { User } from "@/models/User";
import { toPublicUser } from "@/server/users";

const MAX_BYTES = 1_500_000;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Avatars are stored inline as data URLs. Small, and it keeps deployment free
 *  of an object-store dependency. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file provided", "VALIDATION_ERROR", 422);
    if (!ALLOWED.has(file.type)) return fail("Use a PNG, JPEG, WebP or GIF image", "UNSUPPORTED_TYPE", 415);
    if (file.size > MAX_BYTES) return fail("Image must be under 1.5MB", "TOO_LARGE", 413);

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

    await connectDB();
    const updated = await User.findByIdAndUpdate(user._id, { $set: { avatar: dataUrl } }, { new: true }).lean();
    if (!updated) return fail("User not found", "NOT_FOUND", 404);
    return ok({ user: toPublicUser(updated) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    await connectDB();
    const updated = await User.findByIdAndUpdate(user._id, { $set: { avatar: null } }, { new: true }).lean();
    if (!updated) return fail("User not found", "NOT_FOUND", 404);
    return ok({ user: toPublicUser(updated) });
  } catch (error) {
    return handleError(error);
  }
}
