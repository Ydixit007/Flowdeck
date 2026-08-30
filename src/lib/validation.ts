import { z } from "zod";
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  PLATFORMS,
  PRIORITIES,
  PROJECT_STATUSES,
  RECURRENCE_FREQS,
  TASK_STATUSES,
  VISIBILITIES,
  WORKSPACE_ROLES,
} from "@/lib/types";

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

/** Query shape for every endpoint scoped to a single workspace. */
export const workspaceQuerySchema = z.object({ workspaceId: objectId });
const optionalId = objectId.nullish();

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .transform((v) => new Date(v));

const nullableDate = isoDate.nullish();

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_.-]+$/, "Letters, numbers, dot, dash, underscore only"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  timezone: z.string().max(64).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9_.-]+$/).optional(),
  bio: z.string().max(400).nullish(),
  timezone: z.string().max(64).optional(),
});

export const notificationPrefsSchema = z.object({
  channels: z.object({ push: z.boolean(), inApp: z.boolean() }).partial().optional(),
  kinds: z.record(z.string(), z.boolean()).optional(),
  quietHours: z
    .object({
      enabled: z.boolean(),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
    })
    .partial()
    .optional(),
});

export const recurrenceSchema = z.object({
  freq: z.enum(RECURRENCE_FREQS),
  interval: z.number().int().min(1).max(365).default(1),
  byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  byMonthDay: z.number().int().min(1).max(31).optional(),
  byMonth: z.number().int().min(1).max(12).optional(),
  until: nullableDate,
  count: z.number().int().min(1).max(1000).nullish(),
});

export const contentMetaSchema = z.object({
  platform: z.enum(PLATFORMS),
  contentType: z.enum(CONTENT_TYPES),
  caption: z.string().max(3000).nullish(),
  body: z.string().max(20000).nullish(),
  contentStatus: z.enum(CONTENT_STATUSES),
  publishAt: nullableDate,
});

export const devMetaSchema = z.object({
  githubUrl: z.string().url().max(500).nullish(),
  pullRequestUrl: z.string().url().max(500).nullish(),
  issueUrl: z.string().url().max(500).nullish(),
  branchName: z.string().max(200).nullish(),
  technicalNotes: z.string().max(20000).nullish(),
});

export const createTaskSchema = z.object({
  workspaceId: objectId,
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).nullish(),
  projectId: optionalId,
  milestoneId: optionalId,
  status: z.enum(TASK_STATUSES).default("TODO"),
  priority: z.enum(PRIORITIES).default("NONE"),
  tagIds: z.array(objectId).max(20).default([]),
  assigneeId: optionalId,
  startAt: nullableDate,
  dueAt: nullableDate,
  allDay: z.boolean().default(false),
  estimatedMinutes: z.number().int().min(0).max(60 * 24 * 30).nullish(),
  actualMinutes: z.number().int().min(0).max(60 * 24 * 30).nullish(),
  recurrence: recurrenceSchema.nullish(),
  subtasks: z.array(z.object({ title: z.string().trim().min(1).max(200), done: z.boolean().default(false) })).max(100).default([]),
  dependsOnIds: z.array(objectId).max(20).default([]),
  visibility: z.enum(VISIBILITIES).default("WORKSPACE"),
  isContent: z.boolean().default(false),
  content: contentMetaSchema.partial().nullish(),
  dev: devMetaSchema.partial().nullish(),
});

export const updateTaskSchema = createTaskSchema
  .omit({ workspaceId: true })
  .partial()
  .extend({
    subtasks: z
      .array(
        z.object({
          _id: objectId.optional(),
          title: z.string().trim().min(1).max(200),
          done: z.boolean().default(false),
        }),
      )
      .max(100)
      .optional(),
    /** How an edit applies to a recurring series. */
    scope: z.enum(["OCCURRENCE", "FUTURE", "SERIES"]).default("SERIES"),
    occurrenceStart: nullableDate,
  });

export const taskQuerySchema = z.object({
  workspaceId: objectId,
  from: isoDate.optional(),
  to: isoDate.optional(),
  projectId: z.union([objectId, z.array(objectId)]).optional(),
  status: z.union([z.enum(TASK_STATUSES), z.array(z.enum(TASK_STATUSES))]).optional(),
  priority: z.union([z.enum(PRIORITIES), z.array(z.enum(PRIORITIES))]).optional(),
  assigneeId: z.union([objectId, z.literal("me"), z.literal("none")]).optional(),
  tagId: z.union([objectId, z.array(objectId)]).optional(),
  platform: z.union([z.enum(PLATFORMS), z.array(z.enum(PLATFORMS))]).optional(),
  contentStatus: z.union([z.enum(CONTENT_STATUSES), z.array(z.enum(CONTENT_STATUSES))]).optional(),
  isContent: z.enum(["true", "false"]).optional(),
  unscheduled: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const createProjectSchema = z.object({
  workspaceId: objectId,
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).nullish(),
  icon: z.string().max(40).default("Folder"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#6366f1"),
  status: z.enum(PROJECT_STATUSES).default("ACTIVE"),
  startDate: nullableDate,
  targetDate: nullableDate,
  memberIds: z.array(objectId).max(50).default([]),
  isContentProject: z.boolean().default(false),
  repoUrl: z.string().url().max(500).nullish(),
});

export const updateProjectSchema = createProjectSchema.omit({ workspaceId: true }).partial();

export const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().max(1000).nullish(),
  targetDate: nullableDate,
  completedAt: nullableDate,
});

export const createTagSchema = z.object({
  workspaceId: objectId,
  name: z.string().trim().toLowerCase().min(1).max(32).regex(/^[a-z0-9-_]+$/),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#64748b"),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(WORKSPACE_ROLES).default("MEMBER"),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const searchSchema = z.object({
  workspaceId: objectId,
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const presenceSchema = z.object({
  workspaceId: objectId,
  activeTaskId: optionalId,
});
