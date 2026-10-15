import { prisma } from "@studio/infra-prisma";
import { DEFAULT_USD_TO_ILS } from "@studio/shared";
import { getCreditBalance } from "./credits.js";
import { monthlyGrantsDue } from "./plans.js";

const PURCHASE_REASONS = new Set(["PURCHASE", "SUBSCRIPTION_GRANT"]);
const USAGE_REASONS = new Set(["RUN_RESERVE", "RUN_COMPLETED", "RUN_RELEASE", "CORRECTION"]);

function usd(amountNis: number): number {
  return Math.round((amountNis / DEFAULT_USD_TO_ILS) * 100) / 100;
}

/** Where the payment came from and whether it was a first purchase or a subscription renewal. */
function paymentSource(providerRef: string): { provider: string; kind: "purchase" | "renewal" | "other" } {
  if (providerRef.startsWith("creem-tx:")) return { provider: "Creem", kind: "renewal" };
  if (providerRef.startsWith("creem:")) return { provider: "Creem", kind: "purchase" };
  if (/^\d+$/.test(providerRef) || providerRef.startsWith("lemon")) return { provider: "Lemon Squeezy", kind: "purchase" };
  return { provider: "אחר", kind: "other" };
}

function subscriptionView(
  sub: {
    planType: string;
    status: string;
    creditsPerPeriod: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  } | null,
  now = new Date()
) {
  if (!sub) return null;
  const months = sub.planType === "BUSINESS" ? 12 : 1;
  const grantsGiven = monthlyGrantsDue(sub.currentPeriodStart, sub.currentPeriodEnd, now, months);
  const active = sub.status === "ACTIVE" || (sub.status === "CANCELLED" && sub.currentPeriodEnd > now);
  return {
    planType: sub.planType,
    status: sub.status,
    creditsPerMonth: sub.creditsPerPeriod,
    periodStart: sub.currentPeriodStart.toISOString(),
    periodEnd: sub.currentPeriodEnd.toISOString(),
    monthsInPeriod: months,
    monthlyGrantsGiven: grantsGiven,
    monthlyGrantsRemaining: active ? Math.max(0, months - grantsGiven) : 0,
    willRenew: sub.status === "ACTIVE"
  };
}

/** Every user who has at least one payment, newest payer first. */
export async function getAdminCustomers(search?: string) {
  const payers = await prisma.payment.groupBy({
    by: ["userId"],
    _count: true,
    _min: { createdAt: true },
    _max: { createdAt: true }
  });
  const ids = payers.map((p) => p.userId);
  if (ids.length === 0) return { items: [] };
  const term = search?.trim();
  const users = await prisma.user.findMany({
    where: {
      id: { in: ids },
      ...(term
        ? {
            OR: [
              { email: { contains: term, mode: "insensitive" as const } },
              { name: { contains: term, mode: "insensitive" as const } }
            ]
          }
        : {})
    },
    include: { subscription: true }
  });
  const byUser = new Map(payers.map((p) => [p.userId, p]));
  const items = await Promise.all(
    users.map(async (u) => {
      const [credits, paid, refunded, lastPayment, ledger, runs] = await Promise.all([
        getCreditBalance(u.id),
        prisma.payment.aggregate({ _sum: { amountNis: true }, where: { userId: u.id, status: "paid" } }),
        prisma.payment.count({ where: { userId: u.id, status: "refunded" } }),
        prisma.payment.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" } }),
        prisma.creditLedger.groupBy({ by: ["reason"], where: { userId: u.id }, _sum: { delta: true } }),
        prisma.projectRun.groupBy({ by: ["status"], where: { userId: u.id }, _count: true })
      ]);
      const creditsBought = ledger
        .filter((row) => PURCHASE_REASONS.has(row.reason))
        .reduce((sum, row) => sum + (row._sum.delta ?? 0), 0);
      const creditsUsed = -ledger
        .filter((row) => USAGE_REASONS.has(row.reason))
        .reduce((sum, row) => sum + (row._sum.delta ?? 0), 0);
      const totalNis = paid._sum.amountNis ?? 0;
      const agg = byUser.get(u.id)!;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        registeredAt: u.createdAt.toISOString(),
        firstPaymentAt: agg._min.createdAt?.toISOString() ?? null,
        lastPaymentAt: agg._max.createdAt?.toISOString() ?? null,
        paymentsCount: agg._count,
        refundedCount: refunded,
        totalPaidNis: totalNis,
        totalPaidUsd: usd(totalNis),
        lastPlanType: lastPayment?.planType ?? null,
        provider: lastPayment ? paymentSource(lastPayment.lemonOrderId).provider : null,
        subscription: subscriptionView(u.subscription),
        credits,
        creditsBought,
        creditsUsed: Math.max(0, creditsUsed),
        videosCompleted: runs.find((r) => r.status === "COMPLETED")?._count ?? 0,
        videosTotal: runs.reduce((sum, r) => sum + r._count, 0),
        lastActivityAt: u.lastLoginAt?.toISOString() ?? null
      };
    })
  );
  items.sort((a, b) => (b.lastPaymentAt ?? "").localeCompare(a.lastPaymentAt ?? ""));
  return { items };
}

/** Full purchase and usage history for one customer. */
export async function getAdminCustomerDetail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
  if (!user) return null;
  const [credits, payments, ledger, runs] = await Promise.all([
    getCreditBalance(userId),
    prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.creditLedger.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.projectRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        status: true,
        brief: true,
        createdAt: true,
        updatedAt: true,
        isCorrectionRun: true,
        automationJobId: true,
        creditEntries: { select: { delta: true, reason: true } }
      }
    })
  ]);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      registeredAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      credits
    },
    subscription: subscriptionView(user.subscription),
    payments: payments.map((p) => {
      const source = paymentSource(p.lemonOrderId);
      return {
        id: p.id,
        at: p.createdAt.toISOString(),
        planType: p.planType,
        status: p.status,
        provider: source.provider,
        kind: source.kind,
        reference: p.lemonOrderId.replace(/^creem(-tx)?:/, ""),
        amountNis: p.amountNis,
        amountUsd: usd(p.amountNis),
        creditsGranted: p.creditsGranted
      };
    }),
    ledger: ledger.map((e) => ({
      id: e.id,
      at: e.createdAt.toISOString(),
      reason: e.reason,
      delta: e.delta,
      balanceAfter: e.balanceAfter,
      runId: e.runId
    })),
    runs: runs.map((r) => {
      const charged = -r.creditEntries
        .filter((e) => USAGE_REASONS.has(e.reason))
        .reduce((sum, e) => sum + e.delta, 0);
      return {
        id: r.id,
        title: (r.brief as { title?: string })?.title ?? "",
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        correction: r.isCorrectionRun,
        automation: Boolean(r.automationJobId),
        creditsCharged: Math.max(0, Math.round(charged * 100) / 100)
      };
    })
  };
}
