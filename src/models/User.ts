import { Schema, model, models, type Model, type Types } from "mongoose";
import { ADMIN_ROLES, type AdminRole } from "@/lib/smol-config";

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  username: string;
  email: string;
  passwordHash: string;
  avatar?: string | null;
  role?: AdminRole | null;
  lastSeenAt?: Date | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  sessionEpoch: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 32 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: null },
    // No role = no access to anything behind login.
    role: { type: String, enum: [...ADMIN_ROLES, null], default: null },
    lastSeenAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    sessionEpoch: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const User: Model<UserDoc> = (models.User as Model<UserDoc>) ?? model<UserDoc>("User", userSchema);
