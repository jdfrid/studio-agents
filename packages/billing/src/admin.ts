import { prisma } from "@studio/infra-prisma";
import { AdminUserUpdateSchema, type AdminUserUpdate } from "@studio/shared";
import { getCreditBalance } from "./credits.js";

export async function getBillingStatus(userId: string) {
  const credits = await getCreditBalance(userId);
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  return {
    credits,
    subscription: sub
      ? {
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
          planType: sub.planType
        }
      : null
  };
}

export async function getAdminDashboard() {
  const [users, payments, runs, costAgg] = await Promise.all([
    prisma.user.count(),
    prisma.payment.aggregate({ _sum: { amountNis: true }, where: { status: "paid" } }),
    prisma.projectRun.groupBy({ by: ["status"], _count: true }),
    prisma.costEvent.aggregate({ _sum: { costNis: true } })
  ]);
  const completed = runs.find((r) => r.status === "COMPLETED")?._count ?? 0;
  const failed = runs.find((r) => r.status === "FAILED")?._count ?? 0;
  const revenue = payments._sum.amountNis ?? 0;
  const cost = costAgg._sum.costNis ?? 0;
  return {
    users,
    revenueNis: revenue,
    costNis: cost,
    marginNis: revenue - cost,
    videosCompleted: completed,
    videosFailed: failed,
    successRate: completed + failed > 0 ? completed / (completed + failed) : 0
  };
}

export async function getAdminUsers(limit = 100) {
  const users = await prisma.user.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: { subscription: true }
  });
  const results = [];
  for (const u of users) {
    const [credits, payments, runs, costs] = await Promise.all([
      getCreditBalance(u.id),
      prisma.payment.aggregate({ _sum: { amountNis: true }, where: { userId: u.id, status: "paid" } }),
      prisma.projectRun.groupBy({ by: ["status"], where: { userId: u.id }, _count: true }),
      prisma.costEvent.aggregate({
        _sum: { costNis: true },
        where: { run: { userId: u.id } }
      })
    ]);
    const completed = runs.find((r) => r.status === "COMPLETED")?._count ?? 0;
    const failed = runs.find((r) => r.status === "FAILED")?._count ?? 0;
    const paid = payments._sum.amountNis ?? 0;
    const cost = costs._sum.costNis ?? 0;
    results.push({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      locale: u.locale,
      credits,
      plan: u.subscription?.planType ?? "PAYG",
      subscriptionStatus: u.subscription?.status ?? null,
      videosCompleted: completed,
      videosFailed: failed,
      revenueNis: paid,
      costNis: cost,
      marginNis: paid - cost,
      lastLoginIp: u.lastLoginIp,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString()
    });
  }
  return results;
}

export async function getAdminUserPnl(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
  if (!user) return null;
  const [payments, runs, costEvents, credits, loginEvents] = await Promise.all([
    prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.projectRun.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.costEvent.findMany({
      where: { run: { userId } },
      orderBy: { startedAt: "desc" },
      take: 200
    }),
    getCreditBalance(userId),
    prisma.userLoginEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 })
  ]);
  const revenue = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountNis, 0);
  const cost = costEvents.reduce((s, e) => s + e.costNis, 0);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
      credits,
      lastLoginIp: user.lastLoginIp,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      subscription: user.subscription
    },
    revenueNis: revenue,
    costNis: cost,
    marginNis: revenue - cost,
    payments,
    loginEvents: loginEvents.map((e) => ({
      id: e.id,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      createdAt: e.createdAt.toISOString()
    })),
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      title: (r.brief as { title?: string })?.title ?? "",
      creditReserved: r.creditReserved,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    })),
    recentCostEvents: costEvents.slice(0, 50)
  };
}

export async function adminAdjustCredits(userId: string, delta: number, note: string) {
  const { grantCredits } = await import("./credits.js");
  return grantCredits(userId, delta, "ADMIN_ADJUST", { note });
}

export async function updateAdminUser(userId: string, patch: AdminUserUpdate) {
  const body = AdminUserUpdateSchema.parse(patch);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.locale !== undefined ? { locale: body.locale } : {})
    },
    include: { subscription: true }
  });
  const credits = await getCreditBalance(userId);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
    credits,
    lastLoginIp: user.lastLoginIp,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}
