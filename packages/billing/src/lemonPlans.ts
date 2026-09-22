import {
  BUSINESS_CREDITS,
  CHECKOUT_PLANS,
  DEFAULT_USD_TO_ILS,
  LEGACY_SUBSCRIPTION_CREDITS,
  PAYG_CREDITS,
  PAYG_PRICE_NIS,
  PAYG_PRICE_USD,
  STARTER_CREDITS,
  type CheckoutCurrency,
  type CheckoutPlanId,
  type PlanType
} from "@studio/shared";

export type LemonPlanGrant = {
  planType: PlanType;
  credits: number;
  checkoutPlan?: CheckoutPlanId;
  interval: "once" | "month";
};

export function checkoutStoreId(currency: CheckoutCurrency = "ils"): string | undefined {
  if (currency === "usd") return process.env.LEMONSQUEEZY_STORE_ID_USD?.trim() || undefined;
  return process.env.LEMONSQUEEZY_STORE_ID?.trim() || undefined;
}

export function checkoutVariantId(plan: CheckoutPlanId, currency: CheckoutCurrency = "ils"): string | undefined {
  if (currency === "usd") {
    if (plan === "payg") return process.env.LEMONSQUEEZY_VARIANT_PAYG_USD;
    if (plan === "starter") return process.env.LEMONSQUEEZY_VARIANT_STARTER_USD;
    return process.env.LEMONSQUEEZY_VARIANT_BUSINESS_USD;
  }
  if (plan === "payg") return process.env.LEMONSQUEEZY_VARIANT_PAYG;
  if (plan === "starter") return process.env.LEMONSQUEEZY_VARIANT_STARTER;
  return process.env.LEMONSQUEEZY_VARIANT_BUSINESS;
}

export function checkoutCopy(plan: CheckoutPlanId): { name: string; description: string } {
  const catalog = CHECKOUT_PLANS[plan];
  if (plan === "payg") {
    return {
      name: "Reelmino — single video",
      description: `${catalog.credits} credits for one video of up to 30 seconds.`
    };
  }
  if (plan === "starter") {
    return {
      name: "Reelmino — Starter",
      description: `${catalog.credits} credits per month, about ${catalog.equivalentVideos} videos of up to 30 seconds.`
    };
  }
  return {
    name: "Reelmino — Business",
    description: `${catalog.credits} credits per month, about ${catalog.equivalentVideos} videos of up to 30 seconds.`
  };
}

export function extractLemonVariantId(payload: Record<string, unknown>): string | null {
  const data = payload.data as Record<string, unknown> | undefined;
  const attrs = (data?.attributes ?? {}) as Record<string, unknown>;
  const firstOrderItem = attrs.first_order_item as Record<string, unknown> | undefined;
  const firstSubItem = attrs.first_subscription_item as Record<string, unknown> | undefined;
  const relationships = data?.relationships as Record<string, unknown> | undefined;
  const variantRel = relationships?.variant as { data?: { id?: unknown } } | undefined;
  const candidates = [
    firstOrderItem?.variant_id,
    firstSubItem?.variant_id,
    attrs.variant_id,
    variantRel?.data?.id
  ];
  for (const candidate of candidates) {
    if (candidate == null || candidate === "") continue;
    return String(candidate);
  }
  return null;
}

export function grantForLemonVariant(
  variantId: string | null,
  kind: "order" | "subscription"
): LemonPlanGrant {
  const id = variantId?.trim() || null;
  const payg = process.env.LEMONSQUEEZY_VARIANT_PAYG?.trim();
  const starter = process.env.LEMONSQUEEZY_VARIANT_STARTER?.trim();
  const business = process.env.LEMONSQUEEZY_VARIANT_BUSINESS?.trim();
  const paygUsd = process.env.LEMONSQUEEZY_VARIANT_PAYG_USD?.trim();
  const starterUsd = process.env.LEMONSQUEEZY_VARIANT_STARTER_USD?.trim();
  const businessUsd = process.env.LEMONSQUEEZY_VARIANT_BUSINESS_USD?.trim();
  const legacy = process.env.LEMONSQUEEZY_VARIANT_SUBSCRIPTION?.trim();

  if (id && ((payg && id === payg) || (paygUsd && id === paygUsd))) {
    return { planType: "PAYG", credits: PAYG_CREDITS, checkoutPlan: "payg", interval: "once" };
  }
  if (id && ((starter && id === starter) || (starterUsd && id === starterUsd))) {
    return { planType: "STARTER", credits: STARTER_CREDITS, checkoutPlan: "starter", interval: "month" };
  }
  if (id && ((business && id === business) || (businessUsd && id === businessUsd))) {
    return { planType: "BUSINESS", credits: BUSINESS_CREDITS, checkoutPlan: "business", interval: "month" };
  }
  if (id && legacy && id === legacy) {
    return { planType: "SUBSCRIPTION", credits: LEGACY_SUBSCRIPTION_CREDITS, interval: "month" };
  }
  if (kind === "subscription") {
    return { planType: "SUBSCRIPTION", credits: LEGACY_SUBSCRIPTION_CREDITS, interval: "month" };
  }
  return { planType: "PAYG", credits: PAYG_CREDITS, checkoutPlan: "payg", interval: "once" };
}

export function orderAmountNis(attrs: Record<string, unknown>, checkoutPlan?: CheckoutPlanId): number {
  const currency = String(attrs.currency ?? "ILS").toUpperCase();
  const total = Number(attrs.total ?? 0) / 100;
  if (currency === "USD") {
    const usd = total > 0 ? total : checkoutPlan ? CHECKOUT_PLANS[checkoutPlan].priceUsd : PAYG_PRICE_USD;
    return Math.round(usd * DEFAULT_USD_TO_ILS * 100) / 100;
  }
  if (total > 0) return total;
  return checkoutPlan ? CHECKOUT_PLANS[checkoutPlan].priceNis : PAYG_PRICE_NIS;
}
