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
