import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody } from "@/lib/api";
import { notificationPrefsSchema } from "@/lib/validation";
import { User, defaultNotificationPrefs } from "@/models/User";
import { toPublicUser } from "@/server/users";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/types";

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, notificationPrefsSchema);
    await connectDB();

    const current = user.notificationPrefs ?? defaultNotificationPrefs();
    const kinds = { ...current.kinds };
    for (const [key, value] of Object.entries(input.kinds ?? {})) {
      if (NOTIFICATION_KINDS.includes(key as NotificationKind)) kinds[key as NotificationKind] = value;
    }

    const merged = {
      channels: { ...current.channels, ...input.channels },
      kinds,
      quietHours: { ...current.quietHours, ...input.quietHours },
    };

    const updated = await User.findByIdAndUpdate(
      user._id,
      { $set: { notificationPrefs: merged } },
      { new: true },
    ).lean();
    if (!updated) throw new Error("User not found");
    return ok({ user: toPublicUser(updated) });
  } catch (error) {
    return handleError(error);
  }
}
