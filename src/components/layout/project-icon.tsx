"use client";

import {
  Bug,
  Code2,
  Folder,
  Megaphone,
  Palette,
  Rocket,
  Sparkles,
  Target,
  Video,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared by the create form and the project header picker. */
export const PROJECT_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

/** Small curated set — a full icon picker is not worth the bundle. */
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  Folder,
  Code2,
  Rocket,
  Megaphone,
  Video,
  Palette,
  Target,
  Bug,
  Sparkles,
  Waves,
};

export const PROJECT_ICON_NAMES = Object.keys(PROJECT_ICONS);

export function ProjectIcon({
  name,
  color,
  className,
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  const Icon = PROJECT_ICONS[name] ?? Folder;
  return <Icon className={cn("size-4 shrink-0", className)} style={color ? { color } : undefined} />;
}
