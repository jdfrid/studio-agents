import type { CheckoutCurrency, CheckoutPlanId } from "@studio/shared";
import { creemApiKey, creemProductId } from "./creem.js";

const ALL_PLANS: CheckoutPlanId[] = ["payg", "starter", "business"];

/** Plans with a Creem product configured. Currency is kept for API compatibility; checkout is USD-only. */
export function configuredCheckoutPlans(_currency: CheckoutCurrency = "usd"): CheckoutPlanId[] {
  if (!creemApiKey()) return [];
  return ALL_PLANS.filter((plan) => Boolean(creemProductId(plan)));
}

export function enabledCheckoutPlansByCurrency(): { ils: CheckoutPlanId[]; usd: CheckoutPlanId[] } {
  if (process.env.PAYMENTS_ENABLED === "0") return { ils: [], usd: [] };
  const plans = configuredCheckoutPlans();
  return { ils: plans, usd: plans };
}

/** True when Creem can open at least one checkout plan. */
export function isBillingConfigured(): boolean {
  return configuredCheckoutPlans().length > 0;
}

/** Online checkout. Set PAYMENTS_ENABLED=0 to pause. */
export function isCheckoutEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED !== "0" && isBillingConfigured();
}

export function isCheckoutPlanEnabled(plan: CheckoutPlanId, currency: CheckoutCurrency = "usd"): boolean {
  return process.env.PAYMENTS_ENABLED !== "0" && configuredCheckoutPlans(currency).includes(plan);
}

export function enabledCheckoutPlans(currency: CheckoutCurrency = "usd"): CheckoutPlanId[] {
  if (process.env.PAYMENTS_ENABLED === "0") return [];
  return configuredCheckoutPlans(currency);
}
