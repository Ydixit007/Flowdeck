import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { listMemberships } from "@/server/authz";
import { toPublicUser } from "@/server/users";
import { Workspace, WorkspaceMember } from "@/models/Workspace";
import { AppProvider, type WorkspaceRef } from "@/lib/client/store";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Server boundary for the whole application: authentication is resolved here,
 * so every page below can assume a signed-in user with at least one workspace.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await connectDB();
  const memberships = await listMemberships(user);

  // Self-heal: an account with no workspace (e.g. a partially failed signup)
  // gets one rather than a broken shell.
  if (memberships.length === 0) {
    const workspace = await Workspace.create({
      name: `${user.name}'s Workspace`,
      slug: `${user.username}-${Date.now().toString(36)}`,
      ownerId: user._id,
    });
    await WorkspaceMember.create({ workspaceId: workspace._id, userId: user._id, role: "OWNER" });
    memberships.push({ workspaceId: workspace._id, role: "OWNER" });
  }

  const workspaceDocs = await Workspace.find({ _id: { $in: memberships.map((m) => m.workspaceId) } })
    .select("name slug color ownerId createdAt")
    .sort({ createdAt: 1 })
    .lean();
  const roleById = new Map(memberships.map((m) => [m.workspaceId.toString(), m.role]));

  const workspaces: WorkspaceRef[] = workspaceDocs.map((w) => ({
    id: w._id.toString(),
    name: w.name,
    slug: w.slug,
    color: w.color,
    ownerId: w.ownerId.toString(),
    role: roleById.get(w._id.toString()) ?? "MEMBER",
  }));

  return (
    <AppProvider
      initialUser={toPublicUser(user)}
      initialWorkspaces={workspaces}
      initialWorkspaceId={workspaces[0]?.id ?? ""}
    >
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
