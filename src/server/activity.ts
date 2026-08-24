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

/** Fire-and-forget: activity logging must never fail the user's action. */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await Activity.create(input);
  } catch (error) {
    console.error("[activity] failed to log", error);
  }
}
