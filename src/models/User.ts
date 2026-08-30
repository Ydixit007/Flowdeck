import { Schema, model, models, type Model, type Types } from "mongoose";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/types";

export interface NotificationPrefs {
  channels: { push: boolean; inApp: boolean };
  kinds: Record<NotificationKind, boolean>;
  quietHours: { enabled: boolean; startHour: number; endHour: number };
}

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  username: string;
  email: string;
  passwordHash: string;
  avatar?: string | null;
  timezone: string;
  bio?: string | null;
  notificationPrefs: NotificationPrefs;
  lastSeenAt?: Date | null;
  activeTaskId?: Types.ObjectId | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  sessionEpoch: number;
  createdAt: Date;
  updatedAt: Date;
}

export const defaultNotificationPrefs = (): NotificationPrefs => ({
  channels: { push: true, inApp: true },
  kinds: Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as Record<NotificationKind, boolean>,
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
});

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 32 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: null },
    timezone: { type: String, default: "UTC" },
    bio: { type: String, default: null, maxlength: 400 },
    notificationPrefs: { type: Schema.Types.Mixed, default: defaultNotificationPrefs },
    lastSeenAt: { type: Date, default: null },
    activeTaskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    sessionEpoch: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.index({ lastSeenAt: -1 });

export const User: Model<UserDoc> = (models.User as Model<UserDoc>) ?? model<UserDoc>("User", userSchema);
