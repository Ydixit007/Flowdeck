import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok, parseBody, type RouteContext } from "@/lib/api";
import { requireMembership } from "@/server/authz";
import { Tag } from "@/models/Tag";
import { Task } from "@/models/Task";

const patchSchema = z.object({
  name: z.string().trim().toLowerCase().min(1).max(32).regex(/^[a-z0-9-_]+$/).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await connectDB();
    const tag = await Tag.findById(id).lean();
    if (!tag) return fail("Tag not found", "NOT_FOUND", 404);
    await requireMembership(user, tag.workspaceId, "MEMBER");
    const input = await parseBody(request, patchSchema);
    const updated = await Tag.findByIdAndUpdate(tag._id, { $set: input }, { new: true }).lean();
    return ok({ tag: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await connectDB();
    const tag = await Tag.findById(id).lean();
    if (!tag) return fail("Tag not found", "NOT_FOUND", 404);
    await requireMembership(user, tag.workspaceId, "MEMBER");
    await Task.updateMany({ tagIds: tag._id }, { $pull: { tagIds: tag._id } });
    await Tag.deleteOne({ _id: tag._id });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
