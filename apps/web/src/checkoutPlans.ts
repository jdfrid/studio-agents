import type { CheckoutCurrency, CheckoutPlanId, UserView } from "@studio/shared";
import { checkoutCurrencyFromLocale } from "@studio/shared";

const ALL_PLANS: CheckoutPlanId[] = ["payg", "starter", "business"];

export function checkoutCurrencyForLanguage(language?: string | null): CheckoutCurrency {
  return checkoutCurrencyFromLocale(language);
}

export function enabledCheckoutPlansForUser(
  user: Pick<UserView, "billingConfigured" | "checkoutPlans" | "checkoutPlansByCurrency"> | null | undefined,
  currency: CheckoutCurrency = "ils"
): CheckoutPlanId[] {
  if (!user) return [];
  const byCurrency = user.checkoutPlansByCurrency?.[currency];
  if (byCurrency) return byCurrency;
  if (currency === "usd") return [];
  if (user.checkoutPlans?.length) return user.checkoutPlans;
  if (user.billingConfigured) return ALL_PLANS;
  return [];
}

export function canCheckoutPlan(
  user: Pick<UserView, "billingConfigured" | "checkoutPlans" | "checkoutPlansByCurrency"> | null | undefined,
  plan: CheckoutPlanId,
  currency: CheckoutCurrency = "ils"
): boolean {
  return enabledCheckoutPlansForUser(user, currency).includes(plan);
}
