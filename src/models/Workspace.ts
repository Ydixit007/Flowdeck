import { Schema, model, models, type Model, type Types } from "mongoose";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/types";

export interface WorkspaceDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  ownerId: Types.ObjectId;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<WorkspaceDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    color: { type: String, default: "#6366f1" },
  },
  { timestamps: true },
);

export const Workspace: Model<WorkspaceDoc> =
  (models.Workspace as Model<WorkspaceDoc>) ?? model<WorkspaceDoc>("Workspace", workspaceSchema);

export interface WorkspaceMemberDoc {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: WorkspaceRole;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const memberSchema = new Schema<WorkspaceMemberDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: WORKSPACE_ROLES, default: "MEMBER" },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

memberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
memberSchema.index({ userId: 1 });

export const WorkspaceMember: Model<WorkspaceMemberDoc> =
  (models.WorkspaceMember as Model<WorkspaceMemberDoc>) ??
  model<WorkspaceMemberDoc>("WorkspaceMember", memberSchema);

export interface InviteDoc {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  email: string;
  role: WorkspaceRole;
  token: string;
  invitedById: Types.ObjectId;
  acceptedAt?: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<InviteDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: WORKSPACE_ROLES, default: "MEMBER" },
    token: { type: String, required: true, unique: true },
    invitedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    acceptedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const Invite: Model<InviteDoc> =
  (models.Invite as Model<InviteDoc>) ?? model<InviteDoc>("Invite", inviteSchema);
