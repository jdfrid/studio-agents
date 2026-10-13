import { z } from "zod";
import { PlanTypeSchema, type PlanType } from "./auth.js";

export const CheckoutPlanIdSchema = z.enum(["payg", "starter", "business"]);
export type CheckoutPlanId = z.infer<typeof CheckoutPlanIdSchema>;

export const CheckoutCurrencySchema = z.enum(["ils", "usd"]);
export type CheckoutCurrency = z.infer<typeof CheckoutCurrencySchema>;

export const CheckoutLocaleSchema = z.enum(["he", "en"]);
export type CheckoutLocale = z.infer<typeof CheckoutLocaleSchema>;

export const CheckoutRequestSchema = z.object({
  plan: CheckoutPlanIdSchema,
  locale: CheckoutLocaleSchema.optional()
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

/** Checkout is sold in USD only (the Lemon store currency). NIS values are for internal P&L. */
const USD_TO_NIS_FOR_CATALOG = 3.7;
const nis = (usd: number) => Math.round(usd * USD_TO_NIS_FOR_CATALOG);

/** One video of up to 30 seconds (CREDIT_NEW_VIDEO). */
export const PAYG_CREDITS = 40;
export const PAYG_PRICE_USD = 5;
export const PAYG_PRICE_NIS = nis(PAYG_PRICE_USD);
/** "starter" = monthly plan: 30 videos per month. */
export const STARTER_CREDITS = 1200;
export const STARTER_PRICE_USD = 100;
export const STARTER_PRICE_NIS = nis(STARTER_PRICE_USD);
/** "business" = yearly plan, paid once a year; credits are granted per month (BUSINESS_CREDITS each month). */
export const BUSINESS_CREDITS = 1200;
export const BUSINESS_PRICE_USD = 1000;
export const BUSINESS_PRICE_NIS = nis(BUSINESS_PRICE_USD);
export const BUSINESS_GRANT_MONTHS = 12;
/** Grandfathered monthly subscription variant: 30 videos per month. */
export const LEGACY_SUBSCRIPTION_CREDITS = 1200;

export type CheckoutPlanCatalog = {
  id: CheckoutPlanId;
  planType: PlanType;
  /** Credits per grant: once for PAYG, per month for both subscriptions. */
  credits: number;
  priceNis: number;
  priceUsd: number;
  /** Billing interval. The yearly plan still grants `credits` every month. */
  interval: "once" | "month" | "year";
  /** Videos per grant (per month for subscriptions). */
  equivalentVideos: number;
};

export const CHECKOUT_PLANS: Record<CheckoutPlanId, CheckoutPlanCatalog> = {
  payg: {
    id: "payg",
    planType: "PAYG",
    credits: PAYG_CREDITS,
    priceNis: PAYG_PRICE_NIS,
    priceUsd: PAYG_PRICE_USD,
    interval: "once",
    equivalentVideos: 1
  },
  starter: {
    id: "starter",
    planType: "STARTER",
    credits: STARTER_CREDITS,
    priceNis: STARTER_PRICE_NIS,
    priceUsd: STARTER_PRICE_USD,
    interval: "month",
    equivalentVideos: 30
  },
  business: {
    id: "business",
    planType: "BUSINESS",
    credits: BUSINESS_CREDITS,
    priceNis: BUSINESS_PRICE_NIS,
    priceUsd: BUSINESS_PRICE_USD,
    interval: "year",
    equivalentVideos: 30
  }
};

export function checkoutLocaleFromLanguage(language?: string | null): CheckoutLocale {
  return (language ?? "").toLowerCase().startsWith("en") ? "en" : "he";
}

/** All checkouts are in USD, for both the Hebrew and English sites. */
export function checkoutCurrencyFromLocale(_locale?: string | null): CheckoutCurrency {
  return "usd";
}

export function formatCheckoutPrice(plan: CheckoutPlanId, currency: CheckoutCurrency): string {
  const catalog = CHECKOUT_PLANS[plan];
  return currency === "usd" ? `$${catalog.priceUsd}` : `₪${catalog.priceNis}`;
}

export function formatEffectivePerVideo(plan: CheckoutPlanId, currency: CheckoutCurrency): string {
  const catalog = CHECKOUT_PLANS[plan];
  const price = currency === "usd" ? catalog.priceUsd : catalog.priceNis;
  const videos = catalog.equivalentVideos * (catalog.interval === "year" ? BUSINESS_GRANT_MONTHS : 1);
  const per = price / Math.max(1, videos);
  const formatted = per.toFixed(2);
  return currency === "usd" ? `$${formatted}` : `₪${formatted}`;
}
