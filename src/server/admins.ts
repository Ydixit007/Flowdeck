import "server-only";
import { ForbiddenError, NotFoundError } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { inviteToken, placeholderAccount } from "@/lib/reset-token";
import type { AdminRole } from "@/lib/smol-config";
import { User } from "@/models/User";
import type { AdminUser } from "@/server/smol";

const isObjectId = (id: string) => /^[a-f\d]{24}$/i.test(id);

export async function listAdmins() {
  await connectDB();
  const rows = await User.find({ role: { $ne: null } })
    .select("name email role lastSeenAt createdAt +passwordResetExpiresAt")
    .sort({ createdAt: 1 })
    .lean();
  return rows.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    role: u.role as AdminRole,
    lastSeenAt: u.lastSeenAt ?? null,
    // Never signed in and still holding a live invite link.
    invitePending: !u.lastSeenAt && !!u.passwordResetExpiresAt && u.passwordResetExpiresAt > new Date(),
    createdAt: u.createdAt,
  }));
}

/** Always returns a 7-day set-password link: a removed admin may never have set a password. */
export async function inviteAdmin(input: { name: string; email: string; role: AdminRole }): Promise<{ id: string; inviteLink: string }> {
  await connectDB();
  const existing = await User.findOne({ email: input.email }).select("role").lean();
  if (existing?.role) throw Object.assign(new Error("That email is already an admin"), { code: 11000 });
  const { link, fields } = inviteToken();
  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: { role: input.role, ...fields }, $inc: { sessionEpoch: 1 } });
    return { id: existing._id.toString(), inviteLink: link };
  }
  const user = await User.create({ name: input.name, email: input.email, role: input.role, ...(await placeholderAccount(input.email)), ...fields });
  return { id: user._id.toString(), inviteLink: link };
}

function notSelf(actor: AdminUser, id: string): void {
  if (!isObjectId(id)) throw new NotFoundError("Admin not found");
  if (actor._id.toString() === id) throw new ForbiddenError("You can't change your own access");
}

/** Bumping sessionEpoch signs the admin out everywhere, so the new role applies on their next request. */
export async function setAdminRole(actor: AdminUser, id: string, role: AdminRole) {
  notSelf(actor, id);
  await connectDB();
  const { matchedCount } = await User.updateOne({ _id: id, role: { $ne: null } }, { $set: { role }, $inc: { sessionEpoch: 1 } });
  if (!matchedCount) throw new NotFoundError("Admin not found");
  return { role };
}

/** Keeps the account row, drops its role and any open invite, and ends its sessions. */
export async function removeAdmin(actor: AdminUser, id: string) {
  notSelf(actor, id);
  await connectDB();
  const { matchedCount } = await User.updateOne(
    { _id: id, role: { $ne: null } },
    { $set: { role: null, passwordResetTokenHash: null, passwordResetExpiresAt: null }, $inc: { sessionEpoch: 1 } },
  );
  if (!matchedCount) throw new NotFoundError("Admin not found");
  return { removed: true };
}
