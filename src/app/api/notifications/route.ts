import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody } from "@/lib/api";
import { Notification } from "@/models/Social";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    await connectDB();
    const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
    const rows = await Notification.find({
      userId: user._id,
      ...(unreadOnly ? { readAt: null } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const unreadCount = await Notification.countDocuments({ userId: user._id, readAt: null });
    return ok({
      notifications: rows.map((n) => ({
        id: n._id.toString(),
        kind: n.kind,
        title: n.title,
        body: n.body ?? null,
        url: n.url ?? null,
        readAt: n.readAt ? new Date(n.readAt).toISOString() : null,
        createdAt: new Date(n.createdAt).toISOString(),
      })),
      unreadCount,
    });
  } catch (error) {
    return handleError(error);
  }
}

const patchSchema = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() });

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, patchSchema);
    await connectDB();
    // Scoped to userId, so one user can never mark another's notifications read.
    await Notification.updateMany(
      { userId: user._id, ...(input.all ? {} : { _id: { $in: input.ids ?? [] } }) },
      { $set: { readAt: new Date() } },
    );
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}
