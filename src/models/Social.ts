import { Schema, model, models, type Model, type Types } from "mongoose";
import { ACTIVITY_KINDS, NOTIFICATION_KINDS, type ActivityKind, type NotificationKind } from "@/lib/types";

export interface CommentDoc {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  mentionIds: Types.ObjectId[];
  editedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<CommentDoc>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, maxlength: 5000 },
    mentionIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

commentSchema.index({ taskId: 1, createdAt: 1 });
commentSchema.index({ workspaceId: 1, createdAt: -1 });
commentSchema.index({ body: "text" });

export const Comment: Model<CommentDoc> =
  (models.Comment as Model<CommentDoc>) ?? model<CommentDoc>("Comment", commentSchema);

export interface ActivityDoc {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  actorId: Types.ObjectId;
  kind: ActivityKind;
  taskId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  targetUserId?: Types.ObjectId | null;
  /** Short human-readable summary rendered in feeds. */
  summary: string;
  meta?: Record<string, string | number | boolean | null>;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<ActivityDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ACTIVITY_KINDS, required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    summary: { type: String, required: true, maxlength: 500 },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

activitySchema.index({ workspaceId: 1, createdAt: -1 });
activitySchema.index({ projectId: 1, createdAt: -1 });
activitySchema.index({ taskId: 1, createdAt: 1 });

export const Activity: Model<ActivityDoc> =
  (models.Activity as Model<ActivityDoc>) ?? model<ActivityDoc>("Activity", activitySchema);

export interface NotificationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  workspaceId?: Types.ObjectId | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  url?: string | null;
  taskId?: Types.ObjectId | null;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: null, maxlength: 1000 },
    url: { type: String, default: null },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export const Notification: Model<NotificationDoc> =
  (models.Notification as Model<NotificationDoc>) ??
  model<NotificationDoc>("Notification", notificationSchema);

export interface PushSubscriptionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const pushSchema = new Schema<PushSubscriptionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: null },
  },
  { timestamps: true },
);

export const PushSubscription: Model<PushSubscriptionDoc> =
  (models.PushSubscription as Model<PushSubscriptionDoc>) ??
  model<PushSubscriptionDoc>("PushSubscription", pushSchema);

export interface AttachmentDoc {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  taskId?: Types.ObjectId | null;
  uploaderId: Types.ObjectId;
  filename: string;
  mimeType: string;
  size: number;
  /** Relative URL under /api/files or a data-store path. */
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<AttachmentDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null, index: true },
    uploaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    filename: { type: String, required: true, maxlength: 260 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
  },
  { timestamps: true },
);

export const Attachment: Model<AttachmentDoc> =
  (models.Attachment as Model<AttachmentDoc>) ?? model<AttachmentDoc>("Attachment", attachmentSchema);
