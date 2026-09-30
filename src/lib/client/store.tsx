"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, qs, ApiClientError } from "@/lib/client/api";
import type { CalendarItem } from "@/server/tasks";
import type { PublicUser, UserRef } from "@/server/users";
import type { TaskStatus } from "@/lib/types";

export interface WorkspaceRef {
  id: string;
  name: string;
  slug: string;
  color: string;
  ownerId: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export interface ProjectRef {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  ownerId: string;
  memberIds: string[];
  isContentProject: boolean;
  repoUrl: string | null;
  milestones: Array<{ _id: string; title: string; targetDate: string | null; completedAt: string | null }>;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
}

export interface TagRef {
  id: string;
  name: string;
  color: string;
}

export interface MemberRef extends UserRef {
  role: string;
}

interface AppState {
  user: PublicUser;
  /** Can switch to the SmolBusiness dashboard. */
  smolAdmin: boolean;
  workspaces: WorkspaceRef[];
  workspaceId: string;
  workspace: WorkspaceRef | undefined;
  projects: ProjectRef[];
  tags: TagRef[];
  members: MemberRef[];
  unreadCount: number;
  setWorkspaceId: (id: string) => void;
  setUser: (user: PublicUser) => void;
  refreshProjects: () => Promise<void>;
  refreshTags: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  setUnreadCount: (count: number) => void;
  /** Bumped whenever tasks change outside a screen's own list, so every
   *  useTasks() refetches. Screens cannot reach each other's local state. */
  taskVersion: number;
  invalidateTasks: () => void;
}

const AppContext = React.createContext<AppState | null>(null);

const WORKSPACE_STORAGE_KEY = "flowdeck.workspaceId";

export function AppProvider({
  initialUser,
  initialWorkspaces,
  initialWorkspaceId,
  smolAdmin = false,
  children,
}: {
  initialUser: PublicUser;
  initialWorkspaces: WorkspaceRef[];
  initialWorkspaceId: string;
  smolAdmin?: boolean;
  children: React.ReactNode;
}) {
  const [user, setUser] = React.useState(initialUser);
  const [workspaces, setWorkspaces] = React.useState(initialWorkspaces);
  // Restore the last active workspace on first render, but only if the user
  // still belongs to it. Lazy init avoids a second render and a flash of the
  // server-chosen workspace.
  const [workspaceId, setWorkspaceIdState] = React.useState(() => {
    if (typeof window === "undefined") return initialWorkspaceId;
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return stored && initialWorkspaces.some((w) => w.id === stored) ? stored : initialWorkspaceId;
  });
  const [projects, setProjects] = React.useState<ProjectRef[]>([]);
  const [tags, setTags] = React.useState<TagRef[]>([]);
  const [members, setMembers] = React.useState<MemberRef[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [taskVersion, setTaskVersion] = React.useState(0);

  const invalidateTasks = React.useCallback(() => setTaskVersion((v) => v + 1), []);

  const setWorkspaceId = React.useCallback((id: string) => {
    setWorkspaceIdState(id);
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
  }, []);

  const refreshProjects = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await api.get<{ projects: ProjectRef[] }>(`/api/projects${qs({ workspaceId })}`);
      setProjects(data.projects);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) return;
      console.error(error);
    }
  }, [workspaceId]);

  const refreshTags = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await api.get<{ tags: TagRef[] }>(`/api/tags${qs({ workspaceId })}`);
      setTags(data.tags);
    } catch (error) {
      console.error(error);
    }
  }, [workspaceId]);

  const refreshMembers = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await api.get<{ members: MemberRef[] }>(`/api/workspaces/${workspaceId}/members`);
      setMembers(data.members);
    } catch (error) {
      console.error(error);
    }
  }, [workspaceId]);

  // One round trip on mount instead of three; the individual refreshers above
  // stay for targeted reloads after a mutation.
  React.useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void api
      .get<{ projects: ProjectRef[]; tags: TagRef[]; members: MemberRef[] }>(
        `/api/bootstrap${qs({ workspaceId })}`,
      )
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects);
        setTags(data.tags);
        setMembers(data.members);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiClientError && error.status === 403) return;
        console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const refreshWorkspaces = React.useCallback(async () => {
    try {
      const data = await api.get<{ workspaces: WorkspaceRef[] }>("/api/workspaces");
      setWorkspaces(data.workspaces);
    } catch {
      // Offline or signed out: keep the list we have.
    }
  }, []);

  // Membership can also change in another tab or by someone else.
  React.useEffect(() => {
    const onFocus = (): void => void refreshWorkspaces();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshWorkspaces]);

  const value = React.useMemo<AppState>(
    () => ({
      user,
      smolAdmin,
      workspaces,
      workspaceId,
      workspace: workspaces.find((w) => w.id === workspaceId),
      projects,
      tags,
      members,
      unreadCount,
      setWorkspaceId,
      setUser,
      refreshProjects,
      refreshTags,
      refreshMembers,
      refreshWorkspaces,
      setUnreadCount,
      taskVersion,
      invalidateTasks,
    }),
    [
      user,
      smolAdmin,
      workspaces,
      workspaceId,
      projects,
      tags,
      members,
      unreadCount,
      setWorkspaceId,
      refreshProjects,
      refreshTags,
      refreshMembers,
      refreshWorkspaces,
      taskVersion,
      invalidateTasks,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = React.useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskFilters {
  projectId?: string[];
  status?: TaskStatus[];
  priority?: string[];
  assigneeId?: string;
  tagId?: string[];
  platform?: string[];
  contentStatus?: string[];
  isContent?: boolean;
}

export interface TaskQuery extends TaskFilters {
  from?: Date;
  to?: Date;
  unscheduled?: boolean;
  includeUnscheduled?: boolean;
}

export interface UseTasksResult {
  items: CalendarItem[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Applies a local change immediately and reverts if the server rejects it. */
  mutateItem: (id: string, patch: Partial<CalendarItem>, persist: () => Promise<unknown>) => Promise<void>;
  removeItem: (id: string, persist: () => Promise<unknown>) => Promise<void>;
}

export function useTasks(query: TaskQuery, deps: unknown[] = []): UseTasksResult {
  const { workspaceId, taskVersion } = useApp();
  const [items, setItems] = React.useState<CalendarItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Callers pass their own dependency values; serialize them into one stable
  // key so the memo never receives a spread dependency list.
  const depsKey = JSON.stringify(deps);
  const search = React.useMemo(
    () =>
      qs({
        workspaceId,
        from: query.from?.toISOString(),
        to: query.to?.toISOString(),
        projectId: query.projectId,
        status: query.status,
        priority: query.priority,
        assigneeId: query.assigneeId,
        tagId: query.tagId,
        platform: query.platform,
        contentStatus: query.contentStatus,
        isContent: query.isContent === undefined ? undefined : String(query.isContent),
        unscheduled: query.unscheduled ? "true" : undefined,
        includeUnscheduled: query.includeUnscheduled ? "true" : undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, depsKey],
  );

  const reload = React.useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await api.get<{ items: CalendarItem[] }>(`/api/tasks${search}`);
      setItems(data.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, search]);

  React.useEffect(() => {
    void reload();
    // taskVersion refetches when another screen created or changed a task.
  }, [reload, taskVersion]);

  const mutateItem = React.useCallback<UseTasksResult["mutateItem"]>(
    async (id, patch, persist) => {
      const snapshot = items;
      setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
      try {
        await persist();
        // Recurring edits can change which occurrences exist, so refetch.
        if (id.includes(":")) await reload();
      } catch (caught) {
        setItems(snapshot);
        toast.error(caught instanceof Error ? caught.message : "Change could not be saved");
      }
    },
    [items, reload],
  );

  const removeItem = React.useCallback<UseTasksResult["removeItem"]>(
    async (id, persist) => {
      const snapshot = items;
      setItems((current) => current.filter((item) => item.id !== id));
      try {
        await persist();
      } catch (caught) {
        setItems(snapshot);
        toast.error(caught instanceof Error ? caught.message : "Delete failed");
      }
    },
    [items],
  );

  return { items, loading, error, reload, mutateItem, removeItem };
}

/** Splits a calendar item id back into its task id and occurrence instant. */
export function splitItemId(id: string): { taskId: string; occurrenceStart: string | null } {
  const index = id.indexOf(":");
  if (index < 0) return { taskId: id, occurrenceStart: null };
  return { taskId: id.slice(0, index), occurrenceStart: id.slice(index + 1) };
}
