import { z } from "zod";

export const ContactRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(4000),
  locale: z.enum(["he", "en"]).optional(),
  /** Honeypot — must stay empty. */
  companyWebsite: z.string().max(200).optional()
});
export type ContactRequest = z.infer<typeof ContactRequestSchema>;
