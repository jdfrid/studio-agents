import { z } from "zod";
import { UserRoleSchema } from "./auth.js";

export const AdminUserUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).nullable().optional(),
  role: UserRoleSchema.optional(),
  locale: z.string().trim().min(2).max(10).optional()
});
export type AdminUserUpdate = z.infer<typeof AdminUserUpdateSchema>;
