import { Schema, model, models, type Model, type Types } from "mongoose";

export interface TagDoc {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  color: string;
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const tagSchema = new Schema<TagDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, lowercase: true, trim: true, maxlength: 32 },
    color: { type: String, default: "#64748b" },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

tagSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export const Tag: Model<TagDoc> = (models.Tag as Model<TagDoc>) ?? model<TagDoc>("Tag", tagSchema);
