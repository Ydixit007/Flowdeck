import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FolderKanban,
  Inbox,
  Megaphone,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. */
  mobile?: boolean;
  shortcut?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox, mobile: true, shortcut: "G I" },
  { href: "/", label: "Today", icon: Sun, mobile: true, shortcut: "G T" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, mobile: true, shortcut: "G C" },
  { href: "/projects", label: "Projects", icon: FolderKanban, shortcut: "G P" },
  { href: "/tasks", label: "My Tasks", icon: CheckSquare, mobile: true, shortcut: "G M" },
  { href: "/content", label: "Content Calendar", icon: Megaphone },
  { href: "/team", label: "Team", icon: Users },
  { href: "/review", label: "Weekly Review", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings, mobile: true },
];

export const PAGE_TITLES: Record<string, string> = {
  "/": "Today",
  "/inbox": "Inbox",
  "/calendar": "Calendar",
  "/projects": "Projects",
  "/tasks": "My Tasks",
  "/content": "Content Calendar",
  "/team": "Team",
  "/review": "Weekly Review",
  "/analytics": "Analytics",
  "/settings": "Settings",
};
