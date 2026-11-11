import { z } from "zod";
import { ADMIN_ROLES } from "@/lib/smol-config";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const inviteAdminSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ADMIN_ROLES),
});

export const updateAdminSchema = z.object({ role: z.enum(ADMIN_ROLES) });
