import "server-only";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { ForbiddenError, NotFoundError, type AuthUser } from "@/lib/auth";
import { Workspace, WorkspaceMember } from "@/models/Workspace";
import type { WorkspaceRole } from "@/lib/types";
import { Project, type ProjectDoc } from "@/models/Project";
import { Task, type TaskDoc } from "@/models/Task";

export const oid = (value: string | Types.ObjectId): Types.ObjectId =>
  typeof value === "string" ? new Types.ObjectId(value) : value;

const RANK: Record<WorkspaceRole, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export interface Membership {
  workspaceId: Types.ObjectId;
  role: WorkspaceRole;
}

/** Throws unless the user belongs to the workspace with at least `minRole`. */
export async function requireMembership(
  user: AuthUser,
  workspaceId: string | Types.ObjectId,
  minRole: WorkspaceRole = "VIEWER",
): Promise<Membership> {
  await connectDB();
  const wsId = oid(workspaceId);
  const member = await WorkspaceMember.findOne({ workspaceId: wsId, userId: user._id })
    .select("role")
    .lean<{ role: WorkspaceRole } | null>();
  if (!member) throw new ForbiddenError("You do not have access to this workspace");
  if ((RANK[member.role] ?? -1) < (RANK[minRole] ?? 0)) {
    throw new ForbiddenError("Insufficient workspace role");
  }
  return { workspaceId: wsId, role: member.role };
}

export async function listMemberships(user: AuthUser): Promise<Membership[]> {
  await connectDB();
  const rows = await WorkspaceMember.find({ userId: user._id })
    .select("workspaceId role")
    .lean<{ workspaceId: Types.ObjectId; role: WorkspaceRole }[]>();
  return rows.map((r) => ({ workspaceId: r.workspaceId, role: r.role }));
}

export async function requireWorkspace(user: AuthUser, workspaceId: string) {
  const membership = await requireMembership(user, workspaceId);
  const workspace = await Workspace.findById(membership.workspaceId).lean();
  if (!workspace) throw new NotFoundError("Workspace not found");
  return { workspace, membership };
}

export async function requireProject(
  user: AuthUser,
  projectId: string,
  minRole: WorkspaceRole = "VIEWER",
): Promise<{ project: ProjectDoc; membership: Membership }> {
  await connectDB();
  const project = await Project.findById(projectId).lean<ProjectDoc | null>();
  if (!project) throw new NotFoundError("Project not found");
  const membership = await requireMembership(user, project.workspaceId, minRole);
  return { project, membership };
}

/**
 * Mongo filter that limits tasks to what this user is allowed to see:
 * private tasks only when they created them or are the assignee.
 */
export function taskVisibilityFilter(user: AuthUser, workspaceIds: Types.ObjectId[]) {
  return {
    workspaceId: { $in: workspaceIds },
    $or: [
      { visibility: { $ne: "PRIVATE" as const } },
      { creatorId: user._id },
      { assigneeId: user._id },
    ],
  };
}

export function canReadTask(user: AuthUser, task: Pick<TaskDoc, "visibility" | "creatorId" | "assigneeId">): boolean {
  if (task.visibility !== "PRIVATE") return true;
  return task.creatorId.equals(user._id) || Boolean(task.assigneeId?.equals(user._id));
}

/** Read access requires membership plus visibility; write additionally requires
 *  MEMBER role, and private tasks stay with their creator/assignee. */
export async function requireTaskAccess(
  user: AuthUser,
  taskId: string,
  mode: "read" | "write" = "read",
): Promise<{ task: TaskDoc; membership: Membership }> {
  await connectDB();
  const task = await Task.findById(taskId).lean<TaskDoc | null>();
  if (!task) throw new NotFoundError("Task not found");
  const membership = await requireMembership(user, task.workspaceId, mode === "write" ? "MEMBER" : "VIEWER");
  if (!canReadTask(user, task)) throw new NotFoundError("Task not found");
  return { task, membership };
}

export function isWorkspaceAdmin(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
