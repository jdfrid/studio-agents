import type { FastifyInstance } from "fastify";
import {
  AutomationCampaignPatchSchema,
  AutomationCampaignWriteSchema,
  AutomationUrlsRequestSchema,
  BrandVariationPolicySchema
} from "@studio/shared";
import {
  campaignDayKey,
  enqueueAutomationProduce,
  enqueueAutomationScan
} from "@studio/orchestrator";
import {
  getAutomationCampaignRow,
  getBrandTemplateRow,
  listAutomationJobs,
  listAutomationProducts,
  patchAutomationCampaignRow,
  prisma,
  toAutomationCampaignView,
  unusedProductCount,
  upsertAutomationCampaignRow
} from "@studio/infra-prisma";
import { requireAuth } from "@studio/auth";
import { gcsClient } from "@studio/providers";

async function tenantForUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, tenantId: true } });
}

async function campaignView(tenantId: string) {
  const row = await getAutomationCampaignRow(tenantId);
  if (!row) return null;
  const unused = await unusedProductCount(row.id);
  let logoUrl: string | null = null;
  if (row.brandTemplate.logoGcsPath) {
    try {
      logoUrl = await gcsClient().signedUrl(row.brandTemplate.logoGcsPath, 3600);
    } catch {
      logoUrl = null;
    }
  }
  return toAutomationCampaignView(row, unused, logoUrl);
}

export async function registerAutomationRoutes(app: FastifyInstance) {
  app.register(async (routes) => {
    routes.addHook("preHandler", requireAuth());

    routes.get("/automation/campaign", async (request) => {
      const user = await tenantForUser(request.user!.sub);
      if (!user) return { campaign: null };
      return { campaign: await campaignView(user.tenantId) };
    });

    routes.put("/automation/campaign", async (request, reply) => {
      const body = AutomationCampaignWriteSchema.parse(request.body);
      const user = await tenantForUser(request.user!.sub);
      if (!user) {
        reply.code(401);
        return { error: "unauthorized" };
      }
      let templateId = body.brandTemplateId?.trim();
      if (templateId) {
        const existing = await getBrandTemplateRow(user.tenantId, templateId);
        if (!existing) {
          reply.code(400);
          return { error: "brand_template_not_found" };
        }
        await prisma.brandTemplate.update({
          where: { id: existing.id },
          data: {
            ...(body.businessName ? { businessName: body.businessName } : {}),
            ...(body.slogan !== undefined ? { slogan: body.slogan || null } : {}),
            websiteUrl: body.websiteUrl
          }
        });
      } else {
        const created = await prisma.brandTemplate.create({
          data: {
            tenantId: user.tenantId,
            name: body.name?.trim() || body.businessName?.trim() || "Automation brand",
            businessName: body.businessName?.trim() || body.name?.trim() || "Brand",
            slogan: body.slogan?.trim() || null,
            websiteUrl: body.websiteUrl,
            durationSeconds: 30,
            platform: "instagram_reels",
            filmTemplate: "product_demo",
            variationPolicy: { music: "vary", voice: "vary", visual: "vary" },
            defaultCreative: { karaokeCaptions: "on", filmTemplate: "product_demo" }
          }
        });
        templateId = created.id;
      }
      if (!templateId) {
        reply.code(400);
        return { error: "brand_template_missing" };
      }
      const templateRow = await prisma.brandTemplate.findUnique({ where: { id: templateId } });
      const fromTemplate =
        BrandVariationPolicySchema.parse(templateRow?.variationPolicy ?? {}).lockedCreativeKeys ?? [];
      await upsertAutomationCampaignRow({
        tenantId: user.tenantId,
        userId: user.id,
        brandTemplateId: templateId,
        websiteUrl: body.websiteUrl,
        timezone: body.timezone,
        hourLocal: body.hourLocal,
        lockedCreativeKeys: body.lockedCreativeKeys ?? fromTemplate,
        enabled: body.enabled
      });
      return { campaign: await campaignView(user.tenantId) };
    });

    routes.patch("/automation/campaign", async (request, reply) => {
      const body = AutomationCampaignPatchSchema.parse(request.body);
      const user = await tenantForUser(request.user!.sub);
      if (!user) {
        reply.code(401);
        return { error: "unauthorized" };
      }
      const updated = await patchAutomationCampaignRow(user.tenantId, body);
      if (!updated) {
        reply.code(404);
        return { error: "not_found" };
      }
      return { campaign: await campaignView(user.tenantId) };
    });

    routes.post("/automation/campaign/scan", async (request, reply) => {
      const user = await tenantForUser(request.user!.sub);
      if (!user) {
        reply.code(401);
        return { error: "unauthorized" };
      }
      const campaign = await getAutomationCampaignRow(user.tenantId);
      if (!campaign) {
        reply.code(404);
        return { error: "not_found" };
      }
      await prisma.automationCampaign.update({
        where: { id: campaign.id },
        data: { status: "running", lastError: null }
      });
      await enqueueAutomationScan(campaign.id);
      return { ok: true, queued: true };
    });

    routes.post("/automation/campaign/urls", async (request, reply) => {
      const body = AutomationUrlsRequestSchema.parse(request.body);
      const user = await tenantForUser(request.user!.sub);
      if (!user) {
        reply.code(401);
        return { error: "unauthorized" };
      }
      const campaign = await getAutomationCampaignRow(user.tenantId);
      if (!campaign) {
        reply.code(404);
        return { error: "not_found" };
      }
      await prisma.automationCampaign.update({
        where: { id: campaign.id },
        data: { status: "running", lastError: null }
      });
      await enqueueAutomationScan(campaign.id, body.urls);
      return { ok: true, queued: true };
    });

    routes.post("/automation/campaign/run-today", async (request, reply) => {
      const user = await tenantForUser(request.user!.sub);
      if (!user) {
        reply.code(401);
        return { error: "unauthorized" };
      }
      const campaign = await getAutomationCampaignRow(user.tenantId);
      if (!campaign) {
        reply.code(404);
        return { error: "not_found" };
      }
      const dayKey = campaignDayKey(new Date(), campaign.timezone);
      await enqueueAutomationProduce(campaign.id, dayKey);
      return { ok: true, queued: true, dayKey };
    });

    routes.get("/automation/campaign/products", async (request, reply) => {
      const user = await tenantForUser(request.user!.sub);
      if (!user) {
        reply.code(401);
        return { error: "unauthorized" };
      }
      const campaign = await getAutomationCampaignRow(user.tenantId);
      if (!campaign) {
        reply.code(404);
        return { error: "not_found" };
      }
      return { products: await listAutomationProducts(campaign.id) };
    });

    routes.get("/automation/campaign/jobs", async (request, reply) => {
      const user = await tenantForUser(request.user!.sub);
      if (!user) {
        reply.code(401);
        return { error: "unauthorized" };
      }
      const campaign = await getAutomationCampaignRow(user.tenantId);
      if (!campaign) {
        reply.code(404);
        return { error: "not_found" };
      }
      return { jobs: await listAutomationJobs(campaign.id) };
    });
  });
}
