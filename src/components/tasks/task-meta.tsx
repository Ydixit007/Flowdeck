"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUp,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Minus,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentStatus, Platform, Priority, TaskStatus } from "@/lib/types";

export const STATUS_META: Record<TaskStatus, { label: string; icon: LucideIcon; className: string }> = {
  TODO: { label: "To do", icon: CircleDashed, className: "text-muted-foreground" },
  IN_PROGRESS: { label: "In progress", icon: Timer, className: "text-warning" },
  DONE: { label: "Done", icon: CircleCheck, className: "text-success" },
  CANCELLED: { label: "Cancelled", icon: CircleSlash, className: "text-muted-foreground/60" },
};

export const PRIORITY_META: Record<Priority, { label: string; icon: LucideIcon; className: string }> = {
  URGENT: { label: "Urgent", icon: ChevronsUp, className: "text-priority-urgent" },
  HIGH: { label: "High", icon: ArrowUp, className: "text-priority-high" },
  MEDIUM: { label: "Medium", icon: Minus, className: "text-priority-medium" },
  LOW: { label: "Low", icon: ArrowDown, className: "text-priority-low" },
  NONE: { label: "None", icon: Circle, className: "text-priority-none" },
};

export const CONTENT_STATUS_META: Record<ContentStatus, { label: string; className: string }> = {
  IDEA: { label: "Idea", className: "border-border bg-muted text-muted-foreground" },
  DRAFT: { label: "Draft", className: "border-priority-low/30 bg-priority-low/10 text-priority-low" },
  REVIEW: { label: "In review", className: "border-warning/30 bg-warning/12 text-warning" },
  APPROVED: { label: "Approved", className: "border-success/30 bg-success/10 text-success" },
  SCHEDULED: { label: "Scheduled", className: "border-primary/30 bg-primary/10 text-primary" },
  PUBLISHED: { label: "Published", className: "border-success/40 bg-success/18 text-success" },
};

export const PLATFORM_META: Record<Platform, { label: string; color: string }> = {
  INSTAGRAM: { label: "Instagram", color: "#d62976" },
  LINKEDIN: { label: "LinkedIn", color: "#0a66c2" },
  X: { label: "X", color: "#71767b" },
  YOUTUBE: { label: "YouTube", color: "#ff0033" },
  TIKTOK: { label: "TikTok", color: "#00c3c8" },
  FACEBOOK: { label: "Facebook", color: "#1877f2" },
  OTHER: { label: "Other", color: "#8b8fa3" },
};

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = STATUS_META[status];
  return <meta.icon className={cn("size-4 shrink-0", meta.className, className)} aria-hidden />;
}

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const meta = PRIORITY_META[priority];
  if (priority === "NONE") return null;
  return <meta.icon className={cn("size-3.5 shrink-0", meta.className, className)} aria-hidden />;
}

/** Left colour rail used on calendar blocks and list rows. */
export function priorityRailClass(priority: Priority): string {
  switch (priority) {
    case "URGENT":
      return "bg-priority-urgent";
    case "HIGH":
      return "bg-priority-high";
    case "MEDIUM":
      return "bg-priority-medium";
    case "LOW":
      return "bg-priority-low";
    default:
      return "bg-priority-none";
  }
}
