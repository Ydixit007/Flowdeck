import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { requireTaskAccess } from "@/server/authz";
import { Attachment } from "@/models/Social";
import { Task } from "@/models/Task";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_BYTES = 4_000_000;

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { task } = await requireTaskAccess(user, id, "read");
    await connectDB();
    const attachments = await Attachment.find({ taskId: task._id }).sort({ createdAt: 1 }).lean();
    return ok({ attachments });
  } catch (error) {
    return handleError(error);
  }
}

/** Files are stored inline as data URLs — no object store to provision.
 *  ponytail: fine up to a few MB; move to S3/R2 if attachments grow. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { task } = await requireTaskAccess(user, id, "write");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file provided", "VALIDATION_ERROR", 422);
    if (file.size > MAX_BYTES) return fail("File must be under 4MB", "TOO_LARGE", 413);

    await connectDB();
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await Attachment.create({
      workspaceId: task.workspaceId,
      taskId: task._id,
      uploaderId: user._id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      url: `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}`,
    });
    await Task.updateOne({ _id: task._id }, { $addToSet: { attachmentIds: attachment._id } });
    return ok({ attachment: attachment.toObject() }, 201);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { task } = await requireTaskAccess(user, id, "write");
    const attachmentId = new URL(request.url).searchParams.get("attachmentId");
    if (!attachmentId) return fail("attachmentId is required", "VALIDATION_ERROR", 422);
    await connectDB();
    await Attachment.deleteOne({ _id: attachmentId, taskId: task._id });
    await Task.updateOne({ _id: task._id }, { $pull: { attachmentIds: attachmentId } });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
