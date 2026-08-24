import type { NextRequest } from "next/server";
import { startSession } from "mongoose";
import { connectDB, supportsTransactions } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { handleError, ok, fail, parseBody } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";
import { User, defaultNotificationPrefs } from "@/models/User";
import { Workspace, WorkspaceMember } from "@/models/Workspace";
import { resolveTimezone } from "@/lib/tz";

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(clientKey(request, "register"), 5, 60 * 60 * 1000);
    if (!limit.allowed) return fail("Too many attempts. Try later.", "RATE_LIMITED", 429);

    const input = await parseBody(request, registerSchema);
    await connectDB();

    const clash = await User.findOne({
      $or: [{ email: input.email }, { username: input.username }],
    })
      .select("email username")
      .lean();
    if (clash) {
      const field = clash.email === input.email ? "email" : "username";
      return fail(`That ${field} is already taken`, "DUPLICATE", 409, { field });
    }

    const passwordHash = await hashPassword(input.password);
    const timezone = resolveTimezone(input.timezone);

    // User + personal workspace + membership must all land or none of them.
    const useTx = await supportsTransactions();
    const session = useTx ? await startSession() : null;
    let userId = "";
    let epoch = 0;

    const run = async (): Promise<void> => {
      const opts = session ? { session } : {};
      const [user] = await User.create(
        [
          {
            ...input,
            passwordHash,
            timezone,
            notificationPrefs: defaultNotificationPrefs(),
          },
        ],
        opts,
      );
      if (!user) throw new Error("Could not create user");
      userId = user._id.toString();
      epoch = user.sessionEpoch ?? 0;

      const [workspace] = await Workspace.create(
        [{ name: `${input.name}'s Workspace`, slug: `${input.username}-${Date.now().toString(36)}`, ownerId: user._id }],
        opts,
      );
      if (!workspace) throw new Error("Could not create workspace");

      await WorkspaceMember.create(
        [{ workspaceId: workspace._id, userId: user._id, role: "OWNER" }],
        opts,
      );
    };

    if (session) {
      await session.withTransaction(run);
      await session.endSession();
    } else {
      // ponytail: standalone mongod has no transactions; a partial failure here
      // would leave an orphan user. Acceptable for local dev, use a replica set
      // in production for atomicity.
      await run();
    }

    await createSession(userId, epoch);
    return ok({ id: userId }, 201);
  } catch (error) {
    return handleError(error);
  }
}
