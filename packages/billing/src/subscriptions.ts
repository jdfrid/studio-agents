import { prisma } from "@studio/infra-prisma";
import { BUSINESS_GRANT_MONTHS } from "@studio/shared";
import { monthlyGrantsDue, type PlanGrant } from "./plans.js";

export type SubscriptionState = "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

/** Stores the provider's view of a subscription. `providerSubscriptionId` is unique across providers. */
export async function upsertSubscription(input: {
  userId: string;
  providerSubscriptionId: string;
  grant: PlanGrant;
  status: SubscriptionState;
  periodStart: Date;
  periodEnd: Date;
}): Promise<void> {
  const data = {
    lemonSubscriptionId: input.providerSubscriptionId,
    planType: input.grant.planType,
    status: input.status,
    creditsPerPeriod: input.grant.credits,
    currentPeriodStart: input.periodStart,
    currentPeriodEnd: input.periodEnd
  };
  await prisma.subscription.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, ...data },
    update: data
  });
}

export async function setSubscriptionStatus(providerSubscriptionId: string, status: SubscriptionState): Promise<void> {
  await prisma.subscription.updateMany({ where: { lemonSubscriptionId: providerSubscriptionId }, data: { status } });
}

/**
 * Grants the monthly credits owed for the current billing period of one subscription.
 * Idempotent: each (subscription, period start, month) is granted once, under an advisory lock.
 * Monthly plans get one grant per period; yearly plans get one grant per month of the paid year.
 */
export async function syncSubscriptionGrants(providerSubscriptionId: string, now = new Date()): Promise<number> {
  const sub = await prisma.subscription.findUnique({ where: { lemonSubscriptionId: providerSubscriptionId } });
  if (!sub || sub.status === "EXPIRED" || sub.status === "PAST_DUE") return 0;
  const months = sub.planType === "BUSINESS" ? BUSINESS_GRANT_MONTHS : 1;
  const due = monthlyGrantsDue(sub.currentPeriodStart, sub.currentPeriodEnd, now, months);
  if (due <= 0) return 0;
  const periodStart = sub.currentPeriodStart.toISOString();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sub-grant:${providerSubscriptionId}`}))`;
    const existing = await tx.creditLedger.findMany({
      where: {
        userId: sub.userId,
        reason: "SUBSCRIPTION_GRANT",
        AND: [
          { metadata: { path: ["subscriptionId"], equals: providerSubscriptionId } },
          { metadata: { path: ["periodStart"], equals: periodStart } }
        ]
      },
      select: { metadata: true }
    });
    const grantedMonths = new Set(
      existing.map((row) => Number((row.metadata as { month?: unknown } | null)?.month ?? 0))
    );
    let granted = 0;
    for (let month = 1; month <= due; month += 1) {
      if (grantedMonths.has(month)) continue;
      const last = await tx.creditLedger.findFirst({ where: { userId: sub.userId }, orderBy: { createdAt: "desc" } });
      const balance = last?.balanceAfter ?? 0;
      await tx.creditLedger.create({
        data: {
          userId: sub.userId,
          delta: sub.creditsPerPeriod,
          reason: "SUBSCRIPTION_GRANT",
          balanceAfter: Math.round((balance + sub.creditsPerPeriod) * 1000) / 1000,
          metadata: { subscriptionId: providerSubscriptionId, periodStart, month, planType: sub.planType }
        }
      });
      granted += 1;
    }
    return granted;
  });
}

/** Hourly sweep so yearly subscribers receive each month's credits without a provider event. */
export async function syncAllSubscriptionGrants(now = new Date()): Promise<number> {
  const subs = await prisma.subscription.findMany({
    where: { status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { gt: now } },
    select: { lemonSubscriptionId: true }
  });
  let total = 0;
  for (const sub of subs) total += await syncSubscriptionGrants(sub.lemonSubscriptionId, now);
  return total;
}
