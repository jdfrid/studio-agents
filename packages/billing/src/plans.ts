import { CHECKOUT_PLANS, DEFAULT_USD_TO_ILS, type CheckoutPlanId, type PlanType } from "@studio/shared";

export type PlanGrant = {
  planType: PlanType;
  /** Credits per grant: once for one-time purchases, per month for subscriptions. */
  credits: number;
  checkoutPlan: CheckoutPlanId;
  /** Billing interval; "year" plans grant `credits` every month of the paid year. */
  interval: "once" | "month" | "year";
};

export function grantForPlan(plan: CheckoutPlanId): PlanGrant {
  const catalog = CHECKOUT_PLANS[plan];
  return { planType: catalog.planType, credits: catalog.credits, checkoutPlan: plan, interval: catalog.interval };
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export function monthsPerBillingPeriod(interval: PlanGrant["interval"]): number {
  return interval === "year" ? 12 : 1;
}

/** Monthly grants owed so far in a billing period that started at `periodStart` (month 1 is due immediately). */
export function monthlyGrantsDue(periodStart: Date, periodEnd: Date, now: Date, monthsInPeriod: number): number {
  if (now < periodStart) return 0;
  let due = 0;
  for (let k = 0; k < monthsInPeriod; k += 1) {
    const at = addMonths(periodStart, k);
    if (at > now || at >= periodEnd) break;
    due += 1;
  }
  return due;
}

/** Converts a provider amount in minor units (cents/agorot) to NIS for admin P&L. */
export function amountNisFromMinor(amountMinor: unknown, currency: unknown, fallbackPlan?: CheckoutPlanId): number {
  const code = String(currency ?? "USD").toUpperCase();
  const amount = Number(amountMinor ?? 0) / 100;
  if (code === "ILS") return amount > 0 ? amount : fallbackPlan ? CHECKOUT_PLANS[fallbackPlan].priceNis : 0;
  const usd = amount > 0 ? amount : fallbackPlan ? CHECKOUT_PLANS[fallbackPlan].priceUsd : 0;
  return Math.round(usd * DEFAULT_USD_TO_ILS * 100) / 100;
}
