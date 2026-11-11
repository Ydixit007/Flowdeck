import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashResetToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** Set-password token; only its hash is stored, the raw token goes in the link. */
export function createResetToken(ttlMs = 60 * 60 * 1000): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + ttlMs) };
}

/** Invite: a live set-password token plus the fields that store it (shared by the Admins page and the seed script). */
export function inviteToken() {
  const { token, tokenHash, expiresAt } = createResetToken(INVITE_TTL_MS);
  return { link: `/reset-password?token=${token}`, fields: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt } };
}

/** New account that can't sign in until its invite link sets a password. */
export async function placeholderAccount(email: string) {
  const base = email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 24) || "admin";
  return { username: `${base}-${randomBytes(3).toString("hex")}`, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12) };
}
