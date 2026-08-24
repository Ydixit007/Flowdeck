import { Schema, model, models, type Model, type Types } from "mongoose";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/types";

export interface Milestone {
  _id: Types.ObjectId;
  title: string;
  targetDate?: Date | null;
  completedAt?: Date | null;
  description?: string | null;
}

export interface ProjectDoc {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  description?: string | null;
  icon: string;
  color: string;
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  status: ProjectStatus;
  startDate?: Date | null;
  targetDate?: Date | null;
  milestones: Milestone[];
  isContentProject: boolean;
  repoUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const milestoneSchema = new Schema<Milestone>(
  {
    title: { type: String, required: true, maxlength: 140 },
    targetDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    description: { type: String, default: null, maxlength: 1000 },
  },
  { _id: true },
);

const projectSchema = new Schema<ProjectDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: null, maxlength: 2000 },
    icon: { type: String, default: "Folder" },
    color: { type: String, default: "#6366f1" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    status: { type: String, enum: PROJECT_STATUSES, default: "ACTIVE" },
    startDate: { type: Date, default: null },
    targetDate: { type: Date, default: null },
    milestones: { type: [milestoneSchema], default: [] },
    isContentProject: { type: Boolean, default: false },
    repoUrl: { type: String, default: null },
  },
  { timestamps: true },
);

projectSchema.index({ workspaceId: 1, status: 1 });
projectSchema.index({ memberIds: 1 });
projectSchema.index({ ownerId: 1 });

export const Project: Model<ProjectDoc> =
  (models.Project as Model<ProjectDoc>) ?? model<ProjectDoc>("Project", projectSchema);
