import { prisma } from "@studio/infra-prisma";
import { getFreeVideosAllowance, getPlatformSettingsSync } from "./platformSettings.js";
import {
  CREDIT_CORRECTION_ASSET,
  CREDIT_CORRECTION_RENDER,
  CREDIT_NEW_VIDEO,
  correctionCreditCost
} from "@studio/shared";

export class InsufficientCreditsError extends Error {
  constructor(required: number, available: number) {
    super(`אין מספיק קרדיטים (נדרש ${required}, זמין ${available})`);
    this.name = "InsufficientCreditsError";
  }
}

export async function getCreditBalance(userId: string): Promise<number> {
  const last = await prisma.creditLedger.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
  return last?.balanceAfter ?? 0;
}

async function appendLedger(
  userId: string,
  delta: number,
  reason: Parameters<typeof prisma.creditLedger.create>[0]["data"]["reason"],
  runId?: string | null,
  metadata: Record<string, unknown> = {}
): Promise<number> {
  const balance = await getCreditBalance(userId);
  const balanceAfter = Math.round((balance + delta) * 1000) / 1000;
  await prisma.creditLedger.create({
    data: {
      userId,
      runId: runId ?? null,
      delta,
      reason,
      balanceAfter,
      metadata: metadata as object
    }
  });
  return balanceAfter;
}

export function freeVideosPerUser(): number {
  return getPlatformSettingsSync().freeVideosPerUser;
}

export async function getFreeVideosAllowanceAsync(): Promise<number> {
  return getFreeVideosAllowance();
}

export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.LEMONSQUEEZY_API_KEY &&
      process.env.LEMONSQUEEZY_STORE_ID &&
      process.env.LEMONSQUEEZY_VARIANT_PAYG &&
      process.env.LEMONSQUEEZY_VARIANT_SUBSCRIPTION
  );
}

export async function getFreeVideosRemaining(userId: string): Promise<number> {
  const allowance = await getFreeVideosAllowance();
  if (allowance <= 0) return 0;
  const used = await prisma.projectRun.count({ where: { userId } });
  return Math.max(0, allowance - used);
}

export async function creditCostForNewRun(userId: string): Promise<number> {
  const freeRemaining = await getFreeVideosRemaining(userId);
  return freeRemaining > 0 ? 0 : CREDIT_NEW_VIDEO;
}

export async function getCreateVideoEligibility(userId: string): Promise<{
  credits: number;
  freeVideosRemaining: number;
  canCreateVideo: boolean;
  billingConfigured: boolean;
}> {
  const [credits, freeVideosRemaining] = await Promise.all([
    getCreditBalance(userId),
    getFreeVideosRemaining(userId)
  ]);
  const canCreateVideo = freeVideosRemaining > 0 || credits >= CREDIT_NEW_VIDEO;
  return {
    credits,
    freeVideosRemaining,
    canCreateVideo,
    billingConfigured: isBillingConfigured()
  };
}

export async function assertCanStartRun(userId: string, cost?: number): Promise<void> {
  const required = cost ?? (await creditCostForNewRun(userId));
  if (required <= 0) return;
  const balance = await getCreditBalance(userId);
  if (balance < required) throw new InsufficientCreditsError(required, balance);
}

export async function reserveCredits(userId: string, runId: string, amount = CREDIT_NEW_VIDEO): Promise<void> {
  if (amount <= 0) {
    await prisma.projectRun.update({ where: { id: runId }, data: { creditReserved: 0 } });
    return;
  }
  await prisma.$transaction(async (tx) => {
    const last = await tx.creditLedger.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
    const balance = last?.balanceAfter ?? 0;
    if (balance < amount) throw new InsufficientCreditsError(amount, balance);
    await tx.creditLedger.create({
      data: {
        userId,
        runId,
        delta: -amount,
        reason: "RUN_RESERVE",
        balanceAfter: Math.round((balance - amount) * 1000) / 1000,
        metadata: { amount }
      }
    });
    await tx.projectRun.update({
      where: { id: runId },
      data: { creditReserved: amount }
    });
  });
}

export async function commitCredits(runId: string): Promise<void> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId } });
  if (!run?.userId || run.creditReserved <= 0) return;
  const reserved = run.creditReserved;
  await appendLedger(run.userId, 0, "RUN_COMPLETED", runId, { reserved, note: "credit consumed on completion" });
  await prisma.projectRun.update({ where: { id: runId }, data: { creditReserved: 0 } });
}

export async function releaseCredits(runId: string): Promise<void> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId } });
  if (!run?.userId || run.creditReserved <= 0) return;
  const amount = run.creditReserved;
  await appendLedger(run.userId, amount, "RUN_RELEASE", runId, { released: amount });
  await prisma.projectRun.update({ where: { id: runId }, data: { creditReserved: 0 } });
}

export async function chargeCorrectionCredits(
  userId: string,
  runId: string,
  rerunFrom: "asset" | "render" | null | undefined
): Promise<number> {
  const cost = correctionCreditCost(rerunFrom);
  if (cost <= 0) return 0;
  const balance = await getCreditBalance(userId);
  if (balance < cost) throw new InsufficientCreditsError(cost, balance);
  await appendLedger(userId, -cost, "CORRECTION", runId, { rerunFrom, cost });
  return cost;
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: "PURCHASE" | "SUBSCRIPTION_GRANT" | "REFUND" | "ADMIN_ADJUST",
  metadata: Record<string, unknown> = {}
): Promise<number> {
  return appendLedger(userId, amount, reason, null, metadata);
}

export async function isRunCompleted(runId: string): Promise<boolean> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId } });
  return run?.status === "COMPLETED";
}

export function correctionCostForCompletedRun(rerunFrom: "asset" | "render" | null | undefined): number {
  if (rerunFrom === "asset") return CREDIT_CORRECTION_ASSET;
  if (rerunFrom === "render") return CREDIT_CORRECTION_RENDER;
  return 0;
}

export { CREDIT_NEW_VIDEO, CREDIT_CORRECTION_ASSET, CREDIT_CORRECTION_RENDER, correctionCreditCost };
