import type { CheckoutPlanId } from "@studio/shared";
import { checkoutVariantId } from "./lemonPlans.js";

function envSet(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function configuredCheckoutPlans(): CheckoutPlanId[] {
  if (!envSet(process.env.LEMONSQUEEZY_API_KEY) || !envSet(process.env.LEMONSQUEEZY_STORE_ID)) {
    return [];
  }
  const plans: CheckoutPlanId[] = [];
  if (envSet(checkoutVariantId("payg"))) plans.push("payg");
  if (envSet(checkoutVariantId("starter"))) plans.push("starter");
  if (envSet(checkoutVariantId("business"))) plans.push("business");
  return plans;
}

/** True when Lemon Squeezy can open at least one checkout plan. */
export function isBillingConfigured(): boolean {
  return configuredCheckoutPlans().length > 0;
}

/** Online Lemon Squeezy checkout. Set PAYMENTS_ENABLED=0 to pause. */
export function isCheckoutEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED !== "0" && isBillingConfigured();
}

export function isCheckoutPlanEnabled(plan: CheckoutPlanId): boolean {
  return isCheckoutEnabled() && configuredCheckoutPlans().includes(plan);
}

export function enabledCheckoutPlans(): CheckoutPlanId[] {
  return isCheckoutEnabled() ? configuredCheckoutPlans() : [];
}
