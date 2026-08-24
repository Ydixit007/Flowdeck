import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  PLATFORMS,
  PRIORITIES,
  RECURRENCE_FREQS,
  TASK_STATUSES,
  VISIBILITIES,
  type ContentStatus,
  type ContentType,
  type Platform,
  type Priority,
  type RecurrenceFreq,
  type TaskStatus,
  type Visibility,
} from "@/lib/types";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval: number;
  /** 0 = Sunday. Used by WEEKLY / WEEKDAYS / CUSTOM. */
  byWeekday?: number[];
  /** Day of month for MONTHLY / YEARLY. */
  byMonthDay?: number;
  /** 1-12, YEARLY only. */
  byMonth?: number;
  until?: Date | null;
  count?: number | null;
}

export interface Subtask {
  _id: Types.ObjectId;
  title: string;
  done: boolean;
  order: number;
  completedAt?: Date | null;
}

export interface Reminder {
  _id: Types.ObjectId;
  /** Minutes before startAt (or dueAt when there is no start). */
  minutesBefore: number;
  /** Last occurrence date this reminder was delivered for; prevents duplicates. */
  lastSentForOccurrence?: Date | null;
}

export interface DevMeta {
  githubUrl?: string | null;
  pullRequestUrl?: string | null;
  issueUrl?: string | null;
  branchName?: string | null;
  technicalNotes?: string | null;
}

export interface ContentMeta {
  platform: Platform;
  contentType: ContentType;
  caption?: string | null;
  body?: string | null;
  contentStatus: ContentStatus;
  publishAt?: Date | null;
}

export interface TaskDoc {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  milestoneId?: Types.ObjectId | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  tagIds: Types.ObjectId[];
  assigneeId?: Types.ObjectId | null;
  creatorId: Types.ObjectId;
  /** UTC instant. Null for inbox / unscheduled items. */
  startAt?: Date | null;
  dueAt?: Date | null;
  /** True when the task has a date but no meaningful time-of-day. */
  allDay: boolean;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  recurrence?: RecurrenceRule | null;
  /** Set on the master task so occurrence math is timezone-stable. */
  scheduleTimezone?: string | null;
  reminders: Reminder[];
  subtasks: Subtask[];
  dependsOnIds: Types.ObjectId[];
  attachmentIds: Types.ObjectId[];
  visibility: Visibility;
  isContent: boolean;
  content?: ContentMeta | null;
  dev?: DevMeta | null;
  order: number;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const recurrenceSchema = new Schema<RecurrenceRule>(
  {
    freq: { type: String, enum: RECURRENCE_FREQS, required: true },
    interval: { type: Number, default: 1, min: 1, max: 365 },
    byWeekday: { type: [Number], default: undefined },
    byMonthDay: { type: Number, default: undefined },
    byMonth: { type: Number, default: undefined },
    until: { type: Date, default: null },
    count: { type: Number, default: null },
  },
  { _id: false },
);

const subtaskSchema = new Schema<Subtask>(
  {
    title: { type: String, required: true, maxlength: 200 },
    done: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { _id: true },
);

const reminderSchema = new Schema<Reminder>(
  {
    minutesBefore: { type: Number, required: true, min: 0, max: 60 * 24 * 14 },
    lastSentForOccurrence: { type: Date, default: null },
  },
  { _id: true },
);

const contentSchema = new Schema<ContentMeta>(
  {
    platform: { type: String, enum: PLATFORMS, default: "OTHER" },
    contentType: { type: String, enum: CONTENT_TYPES, default: "POST" },
    caption: { type: String, default: null, maxlength: 3000 },
    body: { type: String, default: null, maxlength: 20000 },
    contentStatus: { type: String, enum: CONTENT_STATUSES, default: "IDEA" },
    publishAt: { type: Date, default: null },
  },
  { _id: false },
);

const devSchema = new Schema<DevMeta>(
  {
    githubUrl: { type: String, default: null },
    pullRequestUrl: { type: String, default: null },
    issueUrl: { type: String, default: null },
    branchName: { type: String, default: null, maxlength: 200 },
    technicalNotes: { type: String, default: null, maxlength: 20000 },
  },
  { _id: false },
);

const taskSchema = new Schema<TaskDoc>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    milestoneId: { type: Schema.Types.ObjectId, default: null },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: null, maxlength: 20000 },
    status: { type: String, enum: TASK_STATUSES, default: "TODO" },
    priority: { type: String, enum: PRIORITIES, default: "NONE" },
    tagIds: { type: [Schema.Types.ObjectId], ref: "Tag", default: [] },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    startAt: { type: Date, default: null },
    dueAt: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    estimatedMinutes: { type: Number, default: null, min: 0 },
    actualMinutes: { type: Number, default: null, min: 0 },
    recurrence: { type: recurrenceSchema, default: null },
    scheduleTimezone: { type: String, default: null },
    reminders: { type: [reminderSchema], default: [] },
    subtasks: { type: [subtaskSchema], default: [] },
    dependsOnIds: { type: [Schema.Types.ObjectId], ref: "Task", default: [] },
    attachmentIds: { type: [Schema.Types.ObjectId], ref: "Attachment", default: [] },
    visibility: { type: String, enum: VISIBILITIES, default: "WORKSPACE" },
    isContent: { type: Boolean, default: false },
    content: { type: contentSchema, default: null },
    dev: { type: devSchema, default: null },
    order: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

taskSchema.index({ workspaceId: 1, startAt: 1 });
taskSchema.index({ workspaceId: 1, dueAt: 1 });
taskSchema.index({ workspaceId: 1, status: 1 });
taskSchema.index({ workspaceId: 1, projectId: 1, status: 1 });
taskSchema.index({ assigneeId: 1, startAt: 1 });
taskSchema.index({ creatorId: 1, visibility: 1 });
taskSchema.index({ workspaceId: 1, isContent: 1, "content.publishAt": 1 });
taskSchema.index({ workspaceId: 1, recurrence: 1 });
taskSchema.index({ title: "text", description: "text" });

export const Task: Model<TaskDoc> = (models.Task as Model<TaskDoc>) ?? model<TaskDoc>("Task", taskSchema);

/**
 * Per-occurrence override for a recurring task. Only written when a single
 * occurrence diverges from the series (completed, rescheduled, skipped, edited),
 * so a daily task for a year is one document plus the exceptions the user made.
 */
export interface TaskOccurrenceDoc {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  /** The series-generated start instant this override belongs to. */
  occurrenceStart: Date;
  status?: TaskStatus | null;
  startAt?: Date | null;
  dueAt?: Date | null;
  title?: string | null;
  description?: string | null;
  actualMinutes?: number | null;
  skipped: boolean;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const occurrenceSchema = new Schema<TaskOccurrenceDoc>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    occurrenceStart: { type: Date, required: true },
    status: { type: String, enum: TASK_STATUSES, default: null },
    startAt: { type: Date, default: null },
    dueAt: { type: Date, default: null },
    title: { type: String, default: null, maxlength: 300 },
    description: { type: String, default: null, maxlength: 20000 },
    actualMinutes: { type: Number, default: null },
    skipped: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

occurrenceSchema.index({ taskId: 1, occurrenceStart: 1 }, { unique: true });
occurrenceSchema.index({ workspaceId: 1, occurrenceStart: 1 });

export const TaskOccurrence: Model<TaskOccurrenceDoc> =
  (models.TaskOccurrence as Model<TaskOccurrenceDoc>) ??
  model<TaskOccurrenceDoc>("TaskOccurrence", occurrenceSchema);
