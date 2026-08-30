import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody } from "@/lib/api";
import { Notification } from "@/models/Social";
import { objectId } from "@/lib/validation";

/** Dismissed rows stay in the collection so notify()'s dedupe still sees them,
 *  but they are invisible to every read. */
/** `null` also matches rows written before the field existed. */
const VISIBLE = { dismissedAt: null } as const;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    await connectDB();
    const params = new URL(request.url).searchParams;
    // The badge poll wants one number, not the list.
    if (params.get("countOnly") === "true") {
      return ok({
        notifications: [],
        unreadCount: await Notification.countDocuments({ userId: user._id, ...VISIBLE, readAt: null }),
      });
    }
    const unreadOnly = params.get("unread") === "true";
    const rows = await Notification.find({
      userId: user._id,
      ...VISIBLE,
      ...(unreadOnly ? { readAt: null } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const unreadCount = await Notification.countDocuments({ userId: user._id, ...VISIBLE, readAt: null });
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

const patchSchema = z.object({ ids: z.array(objectId).max(200).optional(), all: z.boolean().optional() });

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, patchSchema);
    await connectDB();
    // Scoped to userId, so one user can never mark another's notifications read.
    await Notification.updateMany(
      { userId: user._id, ...VISIBLE, ...(input.all ? {} : { _id: { $in: input.ids ?? [] } }) },
      { $set: { readAt: new Date() } },
    );
    return ok({ updated: true });
  } catch (error) {
    return handleError(error);
  }
}

/** Dismisses notifications: one by `id`, or the whole list with `all=true`.
 *  Soft-delete, so the reminder sweep's dedupe still sees the row and clearing
 *  the list cannot make the same reminder fire again. Scoped to userId. */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    await connectDB();
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (!id && params.get("all") !== "true") {
      return fail("id or all=true is required", "VALIDATION_ERROR", 422);
    }
    if (id && !objectId.safeParse(id).success) return fail("Invalid id", "VALIDATION_ERROR", 422);
    const now = new Date();
    await Notification.updateMany(
      { userId: user._id, ...VISIBLE, ...(id ? { _id: id } : {}) },
      { $set: { dismissedAt: now, readAt: now } },
    );
    const unreadCount = await Notification.countDocuments({ userId: user._id, ...VISIBLE, readAt: null });
    return ok({ deleted: true, unreadCount });
  } catch (error) {
    return handleError(error);
  }
}
