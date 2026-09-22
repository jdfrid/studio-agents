import type { CheckoutCurrency, CheckoutPlanId } from "@studio/shared";
import { checkoutStoreId, checkoutVariantId } from "./lemonPlans.js";

function envSet(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function configuredCheckoutPlans(currency: CheckoutCurrency = "ils"): CheckoutPlanId[] {
  if (!envSet(process.env.LEMONSQUEEZY_API_KEY) || !envSet(checkoutStoreId(currency))) {
    return [];
  }
  const plans: CheckoutPlanId[] = [];
  if (envSet(checkoutVariantId("payg", currency))) plans.push("payg");
  if (envSet(checkoutVariantId("starter", currency))) plans.push("starter");
  if (envSet(checkoutVariantId("business", currency))) plans.push("business");
  return plans;
}

export function enabledCheckoutPlansByCurrency(): { ils: CheckoutPlanId[]; usd: CheckoutPlanId[] } {
  if (process.env.PAYMENTS_ENABLED === "0") return { ils: [], usd: [] };
  return {
    ils: configuredCheckoutPlans("ils"),
    usd: configuredCheckoutPlans("usd")
  };
}

/** True when Lemon Squeezy can open at least one checkout plan in any currency. */
export function isBillingConfigured(): boolean {
  const byCurrency = enabledCheckoutPlansByCurrency();
  return byCurrency.ils.length > 0 || byCurrency.usd.length > 0;
}

/** Online Lemon Squeezy checkout. Set PAYMENTS_ENABLED=0 to pause. */
export function isCheckoutEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED !== "0" && isBillingConfigured();
}

export function isCheckoutPlanEnabled(plan: CheckoutPlanId, currency: CheckoutCurrency = "ils"): boolean {
  return process.env.PAYMENTS_ENABLED !== "0" && configuredCheckoutPlans(currency).includes(plan);
}

export function enabledCheckoutPlans(currency: CheckoutCurrency = "ils"): CheckoutPlanId[] {
  if (process.env.PAYMENTS_ENABLED === "0") return [];
  return configuredCheckoutPlans(currency);
}
