import type {
  AutomationCampaignPatch,
  AutomationCampaignView,
  AutomationJobView,
  AutomationProductView
} from "@studio/shared";
import { prisma } from "./index.js";

type DiscoveredProductInput = {
  canonicalUrl: string;
  title: string;
  priceText?: string;
  description?: string;
  imageUrls: string[];
};

export async function getAutomationCampaignRow(tenantId: string) {
  return prisma.automationCampaign.findUnique({
    where: { tenantId },
    include: {
      brandTemplate: true,
      _count: { select: { products: true } }
    }
  });
}

export async function unusedProductCount(campaignId: string): Promise<number> {
  return prisma.automationProduct.count({ where: { campaignId, usedAt: null } });
}

export async function upsertAutomationCampaignRow(input: {
  tenantId: string;
  userId: string;
  brandTemplateId: string;
  websiteUrl: string;
  timezone: string;
  hourLocal: number;
  lockedCreativeKeys: string[];
  enabled?: boolean;
}) {
  const existing = await prisma.automationCampaign.findUnique({ where: { tenantId: input.tenantId } });
  if (existing) {
    return prisma.automationCampaign.update({
      where: { id: existing.id },
      data: {
        brandTemplateId: input.brandTemplateId,
        websiteUrl: input.websiteUrl,
        timezone: input.timezone,
        hourLocal: input.hourLocal,
        lockedCreativeKeys: input.lockedCreativeKeys,
        ...(input.enabled != null ? { enabled: input.enabled, status: input.enabled ? "idle" : "paused" } : {})
      },
      include: { brandTemplate: true, _count: { select: { products: true } } }
    });
  }
  return prisma.automationCampaign.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      brandTemplateId: input.brandTemplateId,
      websiteUrl: input.websiteUrl,
      timezone: input.timezone,
      hourLocal: input.hourLocal,
      lockedCreativeKeys: input.lockedCreativeKeys,
      enabled: input.enabled ?? false,
      status: "needs_catalog"
    },
    include: { brandTemplate: true, _count: { select: { products: true } } }
  });
}

export async function patchAutomationCampaignRow(tenantId: string, patch: AutomationCampaignPatch) {
  const existing = await prisma.automationCampaign.findUnique({ where: { tenantId } });
  if (!existing) return null;
  return prisma.automationCampaign.update({
    where: { id: existing.id },
    data: {
      ...(patch.websiteUrl ? { websiteUrl: patch.websiteUrl } : {}),
      ...(patch.timezone ? { timezone: patch.timezone } : {}),
      ...(patch.hourLocal != null ? { hourLocal: patch.hourLocal } : {}),
      ...(patch.enabled != null
        ? {
            enabled: patch.enabled,
            status: patch.enabled ? (existing.status === "paused" ? "idle" : existing.status) : "paused"
          }
        : {})
    },
    include: { brandTemplate: true, _count: { select: { products: true } } }
  });
}

export async function upsertDiscoveredProducts(campaignId: string, products: DiscoveredProductInput[]) {
  const now = new Date();
  for (const product of products) {
    await prisma.automationProduct.upsert({
      where: { campaignId_canonicalUrl: { campaignId, canonicalUrl: product.canonicalUrl } },
      create: {
        campaignId,
        canonicalUrl: product.canonicalUrl,
        title: product.title.slice(0, 180),
        priceText: product.priceText?.slice(0, 80) ?? null,
        description: product.description?.slice(0, 1500) ?? null,
        imageUrls: product.imageUrls.slice(0, 6),
        lastFetchedAt: now
      },
      update: {
        title: product.title.slice(0, 180),
        priceText: product.priceText?.slice(0, 80) ?? null,
        description: product.description?.slice(0, 1500) ?? null,
        imageUrls: product.imageUrls.slice(0, 6),
        lastFetchedAt: now
      }
    });
  }
  const count = await prisma.automationProduct.count({ where: { campaignId } });
  await prisma.automationCampaign.update({
    where: { id: campaignId },
    data: {
      status: count > 0 ? "idle" : "needs_catalog",
      lastError: count > 0 ? null : "no_products_found"
    }
  });
  return count;
}

export async function listAutomationProducts(campaignId: string): Promise<AutomationProductView[]> {
  const rows = await prisma.automationProduct.findMany({
    where: { campaignId },
    orderBy: [{ usedAt: "asc" }, { createdAt: "asc" }]
  });
  return rows.map((row) => ({
    id: row.id,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    priceText: row.priceText,
    description: row.description,
    imageUrls: row.imageUrls,
    usedAt: row.usedAt?.toISOString() ?? null,
    lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null
  }));
}

export async function listAutomationJobs(campaignId: string): Promise<AutomationJobView[]> {
  const rows = await prisma.automationJob.findMany({
    where: { campaignId },
    include: { product: true, run: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 60
  });
  return rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productTitle: row.product.title,
    productUrl: row.product.canonicalUrl,
    runId: row.run?.id ?? row.runId ?? null,
    dayKey: row.dayKey,
    scheduledFor: row.scheduledFor.toISOString(),
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function pickNextAutomationProduct(campaignId: string) {
  const unused = await prisma.automationProduct.findFirst({
    where: { campaignId, usedAt: null },
    orderBy: { createdAt: "asc" }
  });
  if (unused) return unused;
  return prisma.automationProduct.findFirst({
    where: { campaignId },
    orderBy: [{ usedAt: "asc" }, { createdAt: "asc" }]
  });
}

export function toAutomationCampaignView(
  row: NonNullable<Awaited<ReturnType<typeof getAutomationCampaignRow>>>,
  unused: number,
  logoUrl?: string | null
): AutomationCampaignView {
  return {
    id: row.id,
    brandTemplateId: row.brandTemplateId,
    websiteUrl: row.websiteUrl,
    businessName: row.brandTemplate.businessName,
    slogan: row.brandTemplate.slogan,
    logoUrl: logoUrl ?? null,
    enabled: row.enabled,
    timezone: row.timezone,
    hourLocal: row.hourLocal,
    status: row.status,
    distributeMode: "hold",
    lastError: row.lastError,
    productCount: row._count.products,
    unusedCount: unused,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
