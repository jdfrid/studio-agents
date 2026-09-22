import type { CheckoutPlanId, UserView } from "@studio/shared";

const ALL_PLANS: CheckoutPlanId[] = ["payg", "starter", "business"];

export function enabledCheckoutPlansForUser(
  user: Pick<UserView, "billingConfigured" | "checkoutPlans"> | null | undefined
): CheckoutPlanId[] {
  if (!user) return [];
  if (user.checkoutPlans?.length) return user.checkoutPlans;
  if (user.billingConfigured) return ALL_PLANS;
  return [];
}

export function canCheckoutPlan(
  user: Pick<UserView, "billingConfigured" | "checkoutPlans"> | null | undefined,
  plan: CheckoutPlanId
): boolean {
  return enabledCheckoutPlansForUser(user).includes(plan);
}
