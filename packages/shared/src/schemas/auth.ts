import { z } from "zod";

export const ApprovalModeSchema = z.enum(["manual", "auto", "auto_until_render"]);
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

export const UserRoleSchema = z.enum(["USER", "ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PlanTypeSchema = z.enum(["PAYG", "SUBSCRIPTION", "STARTER", "BUSINESS"]);
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

/** Credit cost for a new completed video (up to 30 seconds). */
export const CREDIT_NEW_VIDEO = 40;
/** Correction after COMPLETED — visual regen. */
export const CREDIT_CORRECTION_ASSET = 20;
/** Correction after COMPLETED — render only. */
export const CREDIT_CORRECTION_RENDER = 10;
/** Extra credits when the brief requests lip-sync. */
export const CREDIT_LIP_SYNC_SURCHARGE = 20;
/** Multiply legacy 1-credit-per-video balances by this factor. */
export const CREDIT_LEGACY_SCALE = 40;

export function creditCostForVideo(options?: { preferLipSync?: boolean }): number {
  return CREDIT_NEW_VIDEO + (options?.preferLipSync ? CREDIT_LIP_SYNC_SURCHARGE : 0);
}

export function briefRequestsLipSync(
  brief: { creative?: { preferHeygenDub?: string } | null } | null | undefined
): boolean {
  return brief?.creative?.preferHeygenDub === "on";
}

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
  credits: z.number(),
  freeVideosRemaining: z.number(),
  canCreateVideo: z.boolean(),
  billingConfigured: z.boolean(),
  checkoutPlans: z.array(z.enum(["payg", "starter", "business"])).default([]),
  allowDurationOver30: z.boolean().optional(),
  subscription: SubscriptionViewSchema.nullable()
});
export type UserView = z.infer<typeof UserViewSchema>;

export function correctionCreditCost(rerunFrom: "asset" | "render" | null | undefined): number {
  if (rerunFrom === "asset") return CREDIT_CORRECTION_ASSET;
  if (rerunFrom === "render") return CREDIT_CORRECTION_RENDER;
  return 0;
}
