import { discoverProducts } from "@studio/automation";
import {
  Prisma,
  prisma,
  pickNextAutomationProduct,
  toBrandTemplateView,
  upsertDiscoveredProducts
} from "@studio/infra-prisma";
import { assertCanStartRun, creditCostForNewRun, InsufficientCreditsError } from "@studio/billing";
import { createRun } from "../runService.js";
import { buildAutomationBrief } from "./brief.js";
import { productImagesAsDataUrls, refreshProductSnapshot } from "./media.js";
import type { AutomationJobData } from "./queue.js";
import { campaignDayKey, shouldProduceForLocalHour } from "./time.js";

export { campaignDayKey, campaignLocalHour, shouldProduceForLocalHour } from "./time.js";

export async function runAutomationJob(data: AutomationJobData): Promise<void> {
  if (data.type === "tick") {
    await tickEnabledCampaigns();
    return;
  }
  if (data.type === "scan") {
    await scanCampaignCatalog(data.campaignId, data.extraUrls ?? []);
    return;
  }
  await produceCampaignDay(data.campaignId, data.dayKey);
}

async function tickEnabledCampaigns(): Promise<void> {
  const campaigns = await prisma.automationCampaign.findMany({
    where: { enabled: true, status: { not: "paused" } }
  });
  const now = new Date();
  for (const campaign of campaigns) {
    if (!shouldProduceForLocalHour(now, campaign.timezone, campaign.hourLocal)) continue;
    const dayKey = campaignDayKey(now, campaign.timezone);
    const existing = await prisma.automationJob.findUnique({
      where: { campaignId_dayKey: { campaignId: campaign.id, dayKey } }
    });
    if (existing && (existing.status === "ready" || existing.status === "producing")) continue;
    try {
      await produceCampaignDay(campaign.id, dayKey);
    } catch (error) {
      await prisma.automationCampaign.update({
        where: { id: campaign.id },
        data: { lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) }
      });
    }
  }
}

export async function scanCampaignCatalog(campaignId: string, extraUrls: string[] = []): Promise<number> {
  const campaign = await prisma.automationCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("campaign_not_found");
  await prisma.automationCampaign.update({
    where: { id: campaignId },
    data: { status: "running", lastError: null }
  });
  try {
    const products = await discoverProducts(campaign.websiteUrl, extraUrls);
    return await upsertDiscoveredProducts(campaignId, products);
  } catch (error) {
    await prisma.automationCampaign.update({
      where: { id: campaignId },
      data: {
        status: "needs_catalog",
        lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
      }
    });
    throw error;
  }
}

export async function produceCampaignDay(campaignId: string, dayKey?: string): Promise<void> {
  const campaign = await prisma.automationCampaign.findUnique({
    where: { id: campaignId },
    include: { brandTemplate: true }
  });
  if (!campaign) throw new Error("campaign_not_found");
  const now = new Date();
  const key = dayKey ?? campaignDayKey(now, campaign.timezone);

  const existing = await prisma.automationJob.findUnique({
    where: { campaignId_dayKey: { campaignId, dayKey: key } }
  });
  if (existing && existing.status !== "failed") {
    if (existing.status === "queued" || existing.status === "scraping") {
      await finishProduce(campaign, existing.id);
    }
    return;
  }

  let productCount = await prisma.automationProduct.count({ where: { campaignId } });
  if (productCount === 0) {
    productCount = await scanCampaignCatalog(campaignId);
  }
  const product = await pickNextAutomationProduct(campaignId);
  if (!product) {
    await prisma.automationCampaign.update({
      where: { id: campaignId },
      data: { status: "needs_catalog", lastError: "no_products_found", enabled: false }
    });
    throw new Error("no_products_found");
  }

  let job = existing;
  if (job) {
    await prisma.automationJob.update({
      where: { id: job.id },
      data: { productId: product.id, status: "queued", error: null }
    });
  } else {
    try {
      job = await prisma.automationJob.create({
        data: {
          campaignId,
          productId: product.id,
          dayKey: key,
          scheduledFor: now,
          status: "queued"
        }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      job = await prisma.automationJob.findUniqueOrThrow({
        where: { campaignId_dayKey: { campaignId, dayKey: key } }
      });
      if (job.status === "ready" || job.status === "producing") return;
    }
  }
  await finishProduce(campaign, job.id);
}

async function finishProduce(
  campaign: {
    id: string;
    userId: string;
    lockedCreativeKeys: string[];
    brandTemplate: Parameters<typeof toBrandTemplateView>[0];
  },
  jobId: string
): Promise<void> {
  const job = await prisma.automationJob.findUnique({
    where: { id: jobId },
    include: { product: true }
  });
  if (!job) return;
  await prisma.automationJob.update({ where: { id: jobId }, data: { status: "scraping", error: null } });

  const snapshot = await refreshProductSnapshot(job.product.canonicalUrl);
  if (snapshot) {
    await prisma.automationProduct.update({
      where: { id: job.productId },
      data: {
        title: snapshot.title.slice(0, 180),
        priceText: snapshot.priceText?.slice(0, 80) ?? job.product.priceText,
        description: snapshot.description?.slice(0, 1500) ?? job.product.description,
        imageUrls: snapshot.imageUrls.length ? snapshot.imageUrls.slice(0, 6) : job.product.imageUrls,
        lastFetchedAt: new Date()
      }
    });
  }
  const product = await prisma.automationProduct.findUniqueOrThrow({ where: { id: job.productId } });
  const attachments = await productImagesAsDataUrls(product.imageUrls);
  const baseTemplate = toBrandTemplateView(campaign.brandTemplate);
  const template = {
    ...baseTemplate,
    variationPolicy: {
      ...baseTemplate.variationPolicy,
      lockedCreativeKeys: [
        ...(baseTemplate.variationPolicy.lockedCreativeKeys ?? []),
        ...campaign.lockedCreativeKeys
      ]
    }
  };
  const brief = buildAutomationBrief({
    product,
    template,
    attachments
  });

  const cost = await creditCostForNewRun(campaign.userId);
  try {
    await assertCanStartRun(campaign.userId, cost);
  } catch (error) {
    const message = error instanceof InsufficientCreditsError ? error.message : "insufficient_credits";
    await prisma.automationJob.update({
      where: { id: jobId },
      data: { status: "failed", error: message.slice(0, 500) }
    });
    await prisma.automationCampaign.update({
      where: { id: campaign.id },
      data: { enabled: false, status: "paused", lastError: message.slice(0, 500) }
    });
    return;
  }

  await prisma.automationJob.update({ where: { id: jobId }, data: { status: "producing" } });
  let run;
  try {
    run = await createRun({
      brief,
      userId: campaign.userId,
      creditCost: cost,
      automationJobId: jobId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.automationJob.update({
      where: { id: jobId },
      data: { status: "failed", error: message.slice(0, 500) }
    });
    await prisma.automationCampaign.update({
      where: { id: campaign.id },
      data: { lastError: message.slice(0, 500) }
    });
    throw error;
  }
  await prisma.automationJob.update({
    where: { id: jobId },
    data: { runId: run.id, status: "producing" }
  });
  await prisma.automationProduct.update({
    where: { id: product.id },
    data: { usedAt: new Date() }
  });
  await prisma.automationCampaign.update({
    where: { id: campaign.id },
    data: { status: "idle", lastError: null }
  });
}
