import type { NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseBody, parseQuery } from "@/lib/api";
import { createTagSchema, workspaceQuerySchema } from "@/lib/validation";
import { requireMembership } from "@/server/authz";
import { Tag } from "@/models/Tag";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { workspaceId } = parseQuery(request, workspaceQuerySchema);
    const membership = await requireMembership(user, workspaceId);
    await connectDB();
    const tags = await Tag.find({ workspaceId: membership.workspaceId }).sort({ name: 1 }).lean();
    return ok({ tags: tags.map((t) => ({ ...t, id: t._id.toString() })) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, createTagSchema);
    const { workspaceId } = await requireMembership(user, input.workspaceId, "MEMBER");
    await connectDB();
    // Idempotent: re-adding an existing tag returns it rather than erroring.
    const tag = await Tag.findOneAndUpdate(
      { workspaceId, name: input.name },
      { $setOnInsert: { color: input.color, createdById: user._id } },
      { upsert: true, new: true },
    ).lean();
    return ok({ tag: tag ? { ...tag, id: tag._id.toString() } : null }, 201);
  } catch (error) {
    return handleError(error);
  }
}
