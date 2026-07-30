import { z } from "zod";

export const ApprovalModeSchema = z.enum(["manual", "auto", "auto_until_render"]);
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

export const UserRoleSchema = z.enum(["USER", "ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PlanTypeSchema = z.enum(["PAYG", "SUBSCRIPTION"]);
export type PlanType = z.infer<typeof PlanTypeSchema>;

export const CreditReasonSchema = z.enum([
  "PURCHASE",
  "SUBSCRIPTION_GRANT",
  "RUN_RESERVE",
  "RUN_COMPLETED",
  "RUN_RELEASE",
  "CORRECTION",
  "REFUND",
  "ADMIN_ADJUST"
]);
export type CreditReason = z.infer<typeof CreditReasonSchema>;

/** Credit cost for a new completed video. */
export const CREDIT_NEW_VIDEO = 1;
/** Correction after COMPLETED — visual regen. */
export const CREDIT_CORRECTION_ASSET = 0.5;
/** Correction after COMPLETED — render only. */
export const CREDIT_CORRECTION_RENDER = 0.25;

export const SubscriptionViewSchema = z.object({
  planType: PlanTypeSchema,
  status: z.string(),
  creditsPerPeriod: z.number().int(),
  currentPeriodEnd: z.string()
});
export type SubscriptionView = z.infer<typeof SubscriptionViewSchema>;

export const UserViewSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: UserRoleSchema,
  locale: z.string(),
  credits: z.number(),
  freeVideosRemaining: z.number(),
  canCreateVideo: z.boolean(),
  billingConfigured: z.boolean(),
  subscription: SubscriptionViewSchema.nullable()
});
export type UserView = z.infer<typeof UserViewSchema>;

export function correctionCreditCost(rerunFrom: "asset" | "render" | null | undefined): number {
  if (rerunFrom === "asset") return CREDIT_CORRECTION_ASSET;
  if (rerunFrom === "render") return CREDIT_CORRECTION_RENDER;
  return 0;
}
