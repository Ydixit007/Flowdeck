import "server-only";
import type { Types } from "mongoose";
import { Activity } from "@/models/Social";
import type { ActivityKind } from "@/lib/types";

export interface LogActivityInput {
  workspaceId: Types.ObjectId;
  actorId: Types.ObjectId;
  kind: ActivityKind;
  summary: string;
  taskId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  targetUserId?: Types.ObjectId | null;
  meta?: Record<string, string | number | boolean | null>;
}

/** Kinds where a burst of edits is noise, not history: repeated edits to the
 *  same task by the same person collapse into the most recent row. */
const COALESCE_KINDS = new Set<ActivityKind>(["TASK_UPDATED", "TASK_SCHEDULED"]);
const COALESCE_WINDOW_MS = 10 * 60 * 1000;

/** Fire-and-forget: activity logging must never fail the user's action. */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    if (input.taskId && COALESCE_KINDS.has(input.kind)) {
      const since = new Date(Date.now() - COALESCE_WINDOW_MS);
      const updated = await Activity.findOneAndUpdate(
        { taskId: input.taskId, actorId: input.actorId, kind: input.kind, createdAt: { $gte: since } },
        { $set: { summary: input.summary, meta: input.meta ?? {}, createdAt: new Date() } },
        { sort: { createdAt: -1 } },
      ).lean();
      if (updated) return;
    }
    await Activity.create(input);
  } catch (error) {
    console.error("[activity] failed to log", error);
  }
}
