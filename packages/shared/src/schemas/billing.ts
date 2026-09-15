import { z } from "zod";
import { PlanTypeSchema, type PlanType } from "./auth.js";

export const CheckoutPlanIdSchema = z.enum(["payg", "starter", "business"]);
export type CheckoutPlanId = z.infer<typeof CheckoutPlanIdSchema>;

export const CheckoutRequestSchema = z.object({
  plan: CheckoutPlanIdSchema
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url()
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const BillingStatusSchema = z.object({
  credits: z.number(),
  subscription: z
    .object({
      status: z.string(),
      currentPeriodEnd: z.string(),
      planType: PlanTypeSchema
    })
    .nullable()
});
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

export const PAYG_CREDITS = 49;
export const PAYG_PRICE_NIS = 49;
export const STARTER_CREDITS = 200;
export const STARTER_PRICE_NIS = 179;
export const BUSINESS_CREDITS = 600;
export const BUSINESS_PRICE_NIS = 449;
/** Grandfathered ₪600 / 30-video monthly plan, after the 40× credit scale. */
export const LEGACY_SUBSCRIPTION_CREDITS = 1200;

export type CheckoutPlanCatalog = {
  id: CheckoutPlanId;
  planType: PlanType;
  credits: number;
  priceNis: number;
  interval: "once" | "month";
  equivalentVideos: number;
};

export const CHECKOUT_PLANS: Record<CheckoutPlanId, CheckoutPlanCatalog> = {
  payg: {
    id: "payg",
    planType: "PAYG",
    credits: PAYG_CREDITS,
    priceNis: PAYG_PRICE_NIS,
    interval: "once",
    equivalentVideos: 1
  },
  starter: {
    id: "starter",
    planType: "STARTER",
    credits: STARTER_CREDITS,
    priceNis: STARTER_PRICE_NIS,
    interval: "month",
    equivalentVideos: 5
  },
  business: {
    id: "business",
    planType: "BUSINESS",
    credits: BUSINESS_CREDITS,
    priceNis: BUSINESS_PRICE_NIS,
    interval: "month",
    equivalentVideos: 15
  }
};
