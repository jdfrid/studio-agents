import { prisma } from "@studio/infra-prisma";
import { AdminUserUpdateSchema, type AdminUserUpdate } from "@studio/shared";
import { getCreditBalance, getFreeVideosRemaining } from "./credits.js";
import { getFreeVideosAllowanceForUser } from "./platformSettings.js";

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

export interface AdminListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  from?: Date;
  to?: Date;
}

function dateRange(from?: Date, to?: Date) {
  return from || to ? { gte: from, lte: to } : undefined;
}

export async function getAdminUsers(query: AdminListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where = {
    ...(query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: "insensitive" as const } },
            { name: { contains: query.search, mode: "insensitive" as const } }
          ]
        }
      : {}),
    ...(dateRange(query.from, query.to) ? { createdAt: dateRange(query.from, query.to) } : {})
  };
  const total = await prisma.user.count({ where });
  const users = await prisma.user.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: "desc" },
    include: { subscription: true }
  });
  const results = [];
  for (const u of users) {
    const [credits, payments, runs, costs, freeVideosRemaining, freeVideosAllowance] = await Promise.all([
      getCreditBalance(u.id),
      prisma.payment.aggregate({ _sum: { amountNis: true }, where: { userId: u.id, status: "paid" } }),
      prisma.projectRun.groupBy({ by: ["status"], where: { userId: u.id }, _count: true }),
      prisma.costEvent.aggregate({
        _sum: { costNis: true },
        where: { run: { userId: u.id } }
      }),
      getFreeVideosRemaining(u.id),
      getFreeVideosAllowanceForUser(u.id)
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
      credits,
      freeVideosLimit: u.freeVideosLimit,
      freeVideosAllowance,
      freeVideosRemaining,
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
  return {
    items: results,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function getAdminOperationalMetrics(from: Date, to: Date, bucket: "day" | "week" = "day") {
  const [costs, payments, runs, services] = await Promise.all([
    prisma.costEvent.findMany({
      where: { startedAt: { gte: from, lte: to } },
      select: { startedAt: true, costNis: true, costUsd: true, activityType: true, billedUnits: true }
    }),
    prisma.payment.findMany({
      where: { createdAt: { gte: from, lte: to }, status: "paid" },
      select: { createdAt: true, amountNis: true }
    }),
    prisma.projectRun.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true, status: true }
    }),
    prisma.costEvent.groupBy({
      by: ["activityType"],
      where: { startedAt: { gte: from, lte: to } },
      _sum: { costNis: true, costUsd: true, billedUnits: true },
      _count: true
    })
  ]);
  const points = new Map<string, { costNis: number; revenueNis: number; completed: number; failed: number }>();
  const keyFor = (date: Date) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    if (bucket === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString();
  };
  const point = (date: Date) => {
    const key = keyFor(date);
    const current = points.get(key) ?? { costNis: 0, revenueNis: 0, completed: 0, failed: 0 };
    points.set(key, current);
    return current;
  };
  for (const cost of costs) point(cost.startedAt).costNis += cost.costNis;
  for (const payment of payments) point(payment.createdAt).revenueNis += payment.amountNis;
  for (const run of runs) {
    if (run.status === "COMPLETED") point(run.createdAt).completed += 1;
    if (run.status === "FAILED") point(run.createdAt).failed += 1;
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    bucket,
    totals: {
      costNis: costs.reduce((sum, row) => sum + row.costNis, 0),
      costUsd: costs.reduce((sum, row) => sum + row.costUsd, 0),
      revenueNis: payments.reduce((sum, row) => sum + row.amountNis, 0),
      completed: runs.filter((row) => row.status === "COMPLETED").length,
      failed: runs.filter((row) => row.status === "FAILED").length
    },
    services: services.map((row) => ({
      service: row.activityType,
      events: row._count,
      billedUnits: row._sum.billedUnits ?? 0,
      costNis: row._sum.costNis ?? 0,
      costUsd: row._sum.costUsd ?? 0
    })),
    trend: [...points.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([at, values]) => ({ at, ...values, marginNis: values.revenueNis - values.costNis }))
  };
}

export async function getAdminUserPnl(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
  if (!user) return null;
  const [payments, runs, costEvents, credits, loginEvents, freeVideosRemaining, freeVideosAllowance] =
    await Promise.all([
      prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      prisma.projectRun.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50 }),
      prisma.costEvent.findMany({
        where: { run: { userId } },
        orderBy: { startedAt: "desc" },
        take: 200
      }),
      getCreditBalance(userId),
      prisma.userLoginEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
      getFreeVideosRemaining(userId),
      getFreeVideosAllowanceForUser(userId)
    ]);
  const revenue = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountNis, 0);
  const cost = costEvents.reduce((s, e) => s + e.costNis, 0);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      credits,
      freeVideosLimit: user.freeVideosLimit,
      freeVideosAllowance,
      freeVideosRemaining,
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
      ...(body.freeVideosLimit !== undefined ? { freeVideosLimit: body.freeVideosLimit } : {})
    },
    include: { subscription: true }
  });
  const [credits, freeVideosRemaining, freeVideosAllowance] = await Promise.all([
    getCreditBalance(userId),
    getFreeVideosRemaining(userId),
    getFreeVideosAllowanceForUser(userId)
  ]);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    freeVideosLimit: user.freeVideosLimit,
    freeVideosAllowance,
    freeVideosRemaining,
    credits,
    lastLoginIp: user.lastLoginIp,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}
