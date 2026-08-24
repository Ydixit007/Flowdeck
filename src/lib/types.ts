export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const VISIBILITIES = ["PRIVATE", "WORKSPACE", "PROJECT"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const RECURRENCE_FREQS = [
  "DAILY",
  "WEEKDAYS",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "YEARLY",
  "CUSTOM",
] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

export const PLATFORMS = [
  "INSTAGRAM",
  "LINKEDIN",
  "X",
  "YOUTUBE",
  "TIKTOK",
  "FACEBOOK",
  "OTHER",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CONTENT_STATUSES = [
  "IDEA",
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_TYPES = [
  "POST",
  "REEL",
  "VIDEO",
  "STORY",
  "THREAD",
  "ARTICLE",
  "CAROUSEL",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const NOTIFICATION_KINDS = [
  "TASK_STARTING",
  "TASK_OVERDUE",
  "TASK_ASSIGNED",
  "MENTION",
  "COMMENT",
  "DEADLINE",
  "DAILY_AGENDA",
  "WEEKLY_PLANNING",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const ACTIVITY_KINDS = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_STATUS_CHANGED",
  "TASK_SCHEDULED",
  "TASK_COMPLETED",
  "TASK_DELETED",
  "TASK_ASSIGNED",
  "COMMENT_ADDED",
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "MEMBER_JOINED",
  "MEMBER_REMOVED",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
