import { z } from "zod";
import { PlanTypeSchema } from "./auth.js";

export const CheckoutRequestSchema = z.object({
  plan: z.enum(["payg", "subscription"])
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
