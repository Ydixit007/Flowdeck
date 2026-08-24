import "server-only";
import { Types } from "mongoose";
import type { AuthUser } from "@/lib/auth";
import { User } from "@/models/User";
import type { NotificationPrefs } from "@/models/User";

export interface PublicUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string | null;
  timezone: string;
  bio: string | null;
  notificationPrefs: NotificationPrefs;
  activeTaskId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export function toPublicUser(user: AuthUser): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    username: user.username,
    email: user.email,
    avatar: user.avatar ?? null,
    timezone: user.timezone,
    bio: user.bio ?? null,
    notificationPrefs: user.notificationPrefs,
    activeTaskId: user.activeTaskId?.toString() ?? null,
    lastSeenAt: user.lastSeenAt ? new Date(user.lastSeenAt).toISOString() : null,
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

/** Minimal shape used for avatars, assignee pickers and mentions. */
export interface UserRef {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  activeTaskId: string | null;
  lastSeenAt: string | null;
}

export async function fetchUserRefs(ids: Types.ObjectId[]): Promise<UserRef[]> {
  if (ids.length === 0) return [];
  const rows = await User.find({ _id: { $in: ids } })
    .select("name username avatar activeTaskId lastSeenAt")
    .lean();
  return rows.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    username: u.username,
    avatar: u.avatar ?? null,
    activeTaskId: u.activeTaskId?.toString() ?? null,
    lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null,
  }));
}
