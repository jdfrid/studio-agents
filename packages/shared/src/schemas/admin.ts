import { z } from "zod";
import { UserRoleSchema } from "./auth.js";

const AdminEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

export const AdminUserUpdateSchema = z.object({
  email: AdminEmailSchema.optional(),
  name: z.string().trim().min(1).max(120).nullable().optional(),
  role: UserRoleSchema.optional(),
  /** null = use platform default; 0 = no free videos; N = N free videos for this user */
  freeVideosLimit: z.number().int().min(0).max(10_000).nullable().optional(),
  /** Sets a new email/password login password. Never returned. */
  password: z.string().min(8).max(200).optional()
});
export type AdminUserUpdate = z.infer<typeof AdminUserUpdateSchema>;

export const AdminUserCreateSchema = z.object({
  email: AdminEmailSchema,
  name: z.string().trim().min(1).max(120).nullable().optional(),
  role: UserRoleSchema.default("USER"),
  freeVideosLimit: z.number().int().min(0).max(10_000).nullable().optional(),
  /** Optional: without a password the user signs in with Google or an email code. */
  password: z.string().min(8).max(200).optional(),
  credits: z.number().int().min(0).max(1_000_000).default(0)
});
export type AdminUserCreate = z.infer<typeof AdminUserCreateSchema>;
