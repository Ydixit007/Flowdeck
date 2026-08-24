import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleError, ok, parseQuery } from "@/lib/api";
import { searchSchema } from "@/lib/validation";
import { requireMembership, taskVisibilityFilter } from "@/server/authz";
import { Task } from "@/models/Task";
import { Project } from "@/models/Project";
import { Tag } from "@/models/Tag";
import { Comment } from "@/models/Social";
import { WorkspaceMember } from "@/models/Workspace";
import { fetchUserRefs } from "@/server/users";

export interface SearchHit {
  type: "task" | "project" | "user" | "comment" | "tag" | "content";
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const query = parseQuery(request, searchSchema);
    const { workspaceId } = await requireMembership(user, query.workspaceId);
    await connectDB();

    const limit = query.limit ?? 8;
    // Regex over an escaped needle: prefix matching beats $text for as-you-type
    // search, and the result sets here are workspace-scoped.
    const needle = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const visible = taskVisibilityFilter(user, [workspaceId]);

    const [tasks, projects, tags, comments, memberships] = await Promise.all([
      Task.find({ ...visible, title: needle }).limit(limit).lean(),
      Project.find({ workspaceId, name: needle }).limit(limit).lean(),
      Tag.find({ workspaceId, name: needle }).limit(limit).lean(),
      Comment.find({ workspaceId, body: needle }).limit(limit).lean(),
      WorkspaceMember.find({ workspaceId }).select("userId").lean(),
    ]);

    const memberRefs = await fetchUserRefs(memberships.map((m) => m.userId));
    const users = memberRefs
      .filter((u) => needle.test(u.name) || needle.test(u.username))
      .slice(0, limit);

    const hits: SearchHit[] = [
      ...tasks.map((t) => ({
        type: (t.isContent ? "content" : "task") as SearchHit["type"],
        id: t._id.toString(),
        title: t.title,
        subtitle: t.isContent ? (t.content?.platform ?? null) : t.status.replace("_", " "),
        url: t.isContent ? `/content?task=${t._id.toString()}` : `/tasks?task=${t._id.toString()}`,
      })),
      ...projects.map((p) => ({
        type: "project" as const,
        id: p._id.toString(),
        title: p.name,
        subtitle: p.status,
        url: `/projects/${p._id.toString()}`,
      })),
      ...users.map((u) => ({
        type: "user" as const,
        id: u.id,
        title: u.name,
        subtitle: `@${u.username}`,
        url: `/team`,
      })),
      ...tags.map((t) => ({
        type: "tag" as const,
        id: t._id.toString(),
        title: `#${t.name}`,
        subtitle: null,
        url: `/tasks?tagId=${t._id.toString()}`,
      })),
      ...comments.map((c) => ({
        type: "comment" as const,
        id: c._id.toString(),
        title: c.body.slice(0, 80),
        subtitle: "Comment",
        url: `/tasks?task=${c.taskId.toString()}`,
      })),
    ];

    return ok({ hits });
  } catch (error) {
    return handleError(error);
  }
}
