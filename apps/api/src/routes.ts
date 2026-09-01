import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  StageNameSchema,
  CreateRunRequestSchema,
  CheckoutRequestSchema,
  CreativeActivePatchSchema,
  CreativeFieldCreateSchema,
  CreativeFieldUpdateSchema,
  CreativeOptionCreateSchema,
  CreativeOptionUpdateSchema,
  CreativeReorderSchema
} from "@studio/shared";
import {
  approveStage,
  alignDubbingToVisual,
  applyVisualCorrectionsToRun,
  createArtifactsRepo,
  createProvidersRepo,
  createRun,
  deleteRun,
  getQueueStats,
  getRun,
  getRunCostLedger,
  getRunsLogMatrix,
  rerunStage,
  updateStageOutput,
  uploadStageArtifact
} from "@studio/orchestrator";
import {
  createCreativeField,
  createCreativeOption,
  deleteCreativeField,
  deleteCreativeOption,
  getAdminCreativeCatalog,
  getCreativeCatalog,
  prisma,
  reorderCreativeFields,
  reorderCreativeOptions,
  setCreativeFieldActive,
  setCreativeOptionActive,
  updateCreativeField,
  updateCreativeOption
} from "@studio/infra-prisma";
import { checkGeminiCapabilities, geminiModels } from "@studio/providers";
import {
  buildProductionCostConfig,
  estimateRunCost,
  listRenderProfiles,
  profileToProductionCostConfig,
  resolveRenderProfile
} from "@studio/shared";
import {
  registerAuthRoutes,
  requireAuth,
  requireAdmin,
  authPlugin
} from "@studio/auth";
import {
  assertCanStartRun,
  creditCostForNewRun,
  createCheckout,
  getBillingStatus,
  isBillingConfigured,
  handleLemonWebhook,
  verifyWebhookSignature,
  getAdminDashboard,
  getAdminUsers,
  getAdminOperationalMetrics,
  getAdminUserPnl,
  adminAdjustCredits,
  updateAdminUser,
  InsufficientCreditsError,
  getPlatformSettings,
  updatePlatformSettings
} from "@studio/billing";
import { PlatformSettingsPatchSchema, AdminUserUpdateSchema } from "@studio/shared";
import { officialBillingUrl, pollProviderMonitors } from "@studio/providers";

const mobileRateBuckets = new Map<string, { count: number; resetAt: number }>();

function mobileAdminRateLimit() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith("/auth/mobile") && !request.url.startsWith("/admin")) return;
    const now = Date.now();
    const key = `${request.ip}:${request.url.startsWith("/auth/mobile") ? "auth" : "admin"}`;
    const limit = request.url.startsWith("/auth/mobile") ? 12 : 120;
    const current = mobileRateBuckets.get(key);
    if (!current || current.resetAt <= now) {
      mobileRateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      reply.header("retry-after", Math.ceil((current.resetAt - now) / 1000));
      return reply.code(429).send({ error: "rate_limited" });
    }
  };
}

async function assertRunOwner(runId: string, userId: string, role?: "USER" | "ADMIN") {
  const run = await prisma.projectRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  if (role === "ADMIN") return run;
  if (run.userId && run.userId !== userId) return null;
  return run;
}

async function auditAdmin(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  metadata: Record<string, unknown> = {}
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  if (!user) return;
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      action,
      entity,
      entityId,
      metadata: { actorUserId: userId, ...metadata }
    }
  });
}

export async function registerRoutes(app: FastifyInstance) {
  await authPlugin(app);
  app.addHook("onRequest", mobileAdminRateLimit());
  await registerAuthRoutes(app);

  app.get("/health", async () => ({ ok: true }));
  app.get("/config/creative-catalog", async (request) => {
    const { locale } = z.object({ locale: z.enum(["he", "en"]).default("he") }).parse(request.query);
    return { locale, fields: await getCreativeCatalog(locale) };
  });

  // Browser / Lemon "ping" uses GET — real webhooks are POST with signature.
  app.get("/billing/webhooks/lemonsqueezy", async () => ({
    ok: true,
    service: "lemonsqueezy-webhook",
    method: "POST required for events"
  }));

  app.post("/billing/webhooks/lemonsqueezy", { config: { rawBody: true } }, async (request, reply) => {
    const raw = (request as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
    const sig = request.headers["x-signature"] as string | undefined;
    if (!verifyWebhookSignature(raw, sig)) {
      reply.code(401);
      return { error: "invalid_signature" };
    }
    const body = JSON.parse(raw) as { meta?: { event_name?: string }; data?: unknown };
    await handleLemonWebhook(body.meta?.event_name ?? "", body as Record<string, unknown>);
    return { ok: true };
  });

  app.register(async (userRoutes) => {
    userRoutes.addHook("preHandler", requireAuth());

    userRoutes.get("/billing/status", async (request) => {
      return getBillingStatus(request.user!.sub);
    });

    userRoutes.post("/billing/checkout", async (request, reply) => {
      const body = CheckoutRequestSchema.parse(request.body);
      const user = await prisma.user.findUnique({ where: { id: request.user!.sub } });
      if (!user) {
        reply.code(404);
        return { error: "not_found" };
      }
      if (!isBillingConfigured()) {
        reply.code(503);
        return {
          error: "billing_not_configured",
          message: "מערכת התשלומים עדיין לא מוגדרת. נסה שוב מאוחר יותר או פנה לתמיכה."
        };
      }
      try {
        const url = await createCheckout(user.id, user.email, body.plan);
        return { checkoutUrl: url };
      } catch (err) {
        request.log.error({ err, plan: body.plan, userId: user.id }, "checkout failed");
        reply.code(502);
        const detail = err instanceof Error ? err.message : "checkout failed";
        return {
          error: "checkout_failed",
          message: `לא ניתן לפתוח דף תשלום: ${detail}`
        };
      }
    });

    userRoutes.post("/runs", async (request, reply) => {
      const body = CreateRunRequestSchema.parse(request.body);
      const userId = request.user!.sub;
      const cost = await creditCostForNewRun(userId);
      try {
        await assertCanStartRun(userId, cost);
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          reply.code(402);
          return { error: err.message, code: "insufficient_credits" };
        }
        throw err;
      }
      // Render profile is admin-controlled (platform default); ignore client override.
      const brief = {
        ...body.brief,
        budgetMode: true,
        renderProfile: resolveRenderProfile().id
      };
      const view = await createRun({ brief, userId, creditCost: cost });
      reply.code(201);
      return view;
    });

    userRoutes.get("/runs", async (request) => {
      const rows = await prisma.projectRun.findMany({
        where: { userId: request.user!.sub },
        orderBy: { updatedAt: "desc" },
        take: 100
      });
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        currentStage: r.currentStage,
        title: (r.brief as { title?: string })?.title ?? "(ללא כותרת)",
        updatedAt: r.updatedAt.toISOString()
      }));
    });

    userRoutes.get("/runs/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const view = await getRun(id, request.user!.sub);
      if (!view) {
        reply.code(404);
        return { error: "not_found" };
      }
      return view;
    });

    userRoutes.delete("/runs/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const ok = await deleteRun(id, request.user!.sub);
      if (!ok) {
        reply.code(404);
        return { error: "not_found" };
      }
      return { ok: true };
    });

    userRoutes.post("/runs/:id/stages/:stage/approve", async (request, reply) => {
      const { id, stage } = z.object({ id: z.string(), stage: StageNameSchema }).parse(request.params);
      if (!(await assertRunOwner(id, request.user!.sub, request.user!.role))) {
        reply.code(404);
        return { error: "not_found" };
      }
      const view = await approveStage(id, stage);
      if (!view) {
        reply.code(404);
        return { error: "not_found" };
      }
      return view;
    });

    userRoutes.post("/runs/:id/stages/:stage/rerun", async (request, reply) => {
      const { id, stage } = z.object({ id: z.string(), stage: StageNameSchema }).parse(request.params);
      if (!(await assertRunOwner(id, request.user!.sub, request.user!.role))) {
        reply.code(404);
        return { error: "not_found" };
      }
      const view = await rerunStage(id, stage);
      if (!view) {
        reply.code(404);
        return { error: "not_found" };
      }
      return view;
    });

    userRoutes.patch("/runs/:id/stages/:stage/output", async (request, reply) => {
      const { id, stage } = z.object({ id: z.string(), stage: StageNameSchema }).parse(request.params);
      if (!(await assertRunOwner(id, request.user!.sub, request.user!.role))) {
        reply.code(404);
        return { error: "not_found" };
      }
      try {
        const view = await updateStageOutput(id, stage, request.body);
        if (!view) {
          reply.code(404);
          return { error: "not_found" };
        }
        return view;
      } catch (error) {
        reply.code(400);
        return { error: (error as Error).message };
      }
    });

    userRoutes.post("/runs/:id/stages/:stage/artifacts", async (request, reply) => {
      const { id, stage } = z.object({ id: z.string(), stage: StageNameSchema }).parse(request.params);
      if (!(await assertRunOwner(id, request.user!.sub, request.user!.role))) {
        reply.code(404);
        return { error: "not_found" };
      }
      const body = z
        .object({
          kind: z.string().min(1),
          filename: z.string().min(1),
          mimeType: z.string().min(1),
          base64: z.string().min(1),
          attach: z.discriminatedUnion("type", [
            z.object({ type: z.literal("voice"), sceneId: z.string() }),
            z.object({ type: z.literal("music") }),
            z.object({
              type: z.enum(["referenceFrame", "firstFrame", "lastFrame", "background"]),
              sceneId: z.string()
            }),
            z.object({ type: z.literal("visualAnchor"), sceneId: z.string().optional() }),
            z.object({ type: z.literal("sceneClip"), sceneId: z.string() }),
            z.object({ type: z.literal("final") })
          ])
        })
        .parse(request.body);
      try {
        const view = await uploadStageArtifact(id, stage, {
          kind: body.kind,
          filename: body.filename,
          mimeType: body.mimeType,
          body: Buffer.from(body.base64, "base64"),
          attach: body.attach
        });
        if (!view) {
          reply.code(404);
          return { error: "not_found" };
        }
        return view;
      } catch (error) {
        reply.code(400);
        return { error: (error as Error).message };
      }
    });

    userRoutes.post("/runs/:id/visual-corrections", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = request.body as { rerunFrom?: "asset" | "render" | null };
      const run = await assertRunOwner(id, request.user!.sub, request.user!.role);
      if (!run) {
        reply.code(404);
        return { error: "not_found" };
      }
      const { chargeCorrectionCredits, correctionCreditCostForRun } = await import("@studio/billing");
      const cost = await correctionCreditCostForRun(id, run.status, body?.rerunFrom);
      // Pre-check balance so we don't start a rerun the user can't pay for.
      if (cost > 0) {
        try {
          await chargeCorrectionCredits(request.user!.sub, id, body?.rerunFrom);
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            reply.code(402);
            return { error: err.message, code: "insufficient_credits", creditCost: cost };
          }
          throw err;
        }
      }
      try {
        const view = await applyVisualCorrectionsToRun(id, request.body, request.user!.sub);
        if (!view) {
          reply.code(404);
          return { error: "not_found" };
        }
        return view;
      } catch (error) {
        // Best-effort refund if apply failed after charge.
        if (cost > 0) {
          const { grantCredits } = await import("@studio/billing");
          await grantCredits(request.user!.sub, cost, "REFUND", {
            runId: id,
            reason: "visual_correction_failed",
            error: (error as Error).message
          }).catch(() => undefined);
        }
        reply.code(400);
        return { error: (error as Error).message };
      }
    });

    userRoutes.post("/runs/:id/align-dubbing-to-visual", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      if (!(await assertRunOwner(id, request.user!.sub, request.user!.role))) {
        reply.code(404);
        return { error: "not_found" };
      }
      try {
        const view = await alignDubbingToVisual(id);
        if (!view) {
          reply.code(404);
          return { error: "not_found" };
        }
        return view;
      } catch (error) {
        reply.code(400);
        return { error: (error as Error).message };
      }
    });

    userRoutes.post("/runs/:id/scenes/:sceneId/regenerate-visual", async (request, reply) => {
      const { id, sceneId } = z.object({ id: z.string(), sceneId: z.string() }).parse(request.params);
      if (!(await assertRunOwner(id, request.user!.sub, request.user!.role))) {
        reply.code(404);
        return { error: "not_found" };
      }
      const view = await rerunStage(id, "asset");
      if (!view) {
        reply.code(404);
        return { error: "not_found" };
      }
      return { ...view, regeneratedSceneId: sceneId, rerunStage: "asset" };
    });

    userRoutes.post("/runs/:id/scenes/:sceneId/regenerate-video", async (request, reply) => {
      const { id, sceneId } = z.object({ id: z.string(), sceneId: z.string() }).parse(request.params);
      if (!(await assertRunOwner(id, request.user!.sub, request.user!.role))) {
        reply.code(404);
        return { error: "not_found" };
      }
      const view = await rerunStage(id, "render");
      if (!view) {
        reply.code(404);
        return { error: "not_found" };
      }
      return { ...view, regeneratedSceneId: sceneId, rerunStage: "render" };
    });

    userRoutes.get("/runs/:id/artifacts", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      if (!(await assertRunOwner(id, request.user!.sub, request.user!.role))) {
        reply.code(404);
        return { error: "not_found" };
      }
      const repo = createArtifactsRepo();
      void reply;
      return repo.list(id);
    });

    userRoutes.get("/artifacts/:id/signed-url", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const artifact = await prisma.artifact.findUnique({ where: { id }, include: { run: true } });
      const isAdmin = request.user!.role === "ADMIN";
      if (!artifact || (!isAdmin && (!artifact.run.userId || artifact.run.userId !== request.user!.sub))) {
        reply.code(404);
        return { error: "not_found" };
      }
      const repo = createArtifactsRepo();
      const url = await repo.signedUrl(id);
      return { url };
    });
  });

  app.register(
    async (adminRoutes) => {
    adminRoutes.addHook("preHandler", requireAdmin());

    adminRoutes.get("/health/queues", async () => {
      const queues = await getQueueStats();
      return { ok: true, queues };
    });

    adminRoutes.get("/gemini/capabilities", async () => {
      const tenant = await prisma.tenant.findFirst({ where: { slug: process.env.DEFAULT_TENANT_SLUG ?? "demo" } });
      const provider = tenant ? await createProvidersRepo(tenant.id).primary("GEMINI") : null;
      return checkGeminiCapabilities(provider);
    });

    adminRoutes.get("/config/render-profiles", async () => {
      const tenant = await prisma.tenant.findFirst({ where: { slug: process.env.DEFAULT_TENANT_SLUG ?? "demo" } });
      const provider = tenant ? await createProvidersRepo(tenant.id).primary("GEMINI") : null;
      const videoModel = geminiModels(provider).video;
      const baseConfig = buildProductionCostConfig(videoModel);
      const defaultProfile = resolveRenderProfile();
      return {
        defaultProfileId: defaultProfile.id,
        profiles: listRenderProfiles().map((profile) => ({
          id: profile.id,
          label: profile.label,
          provider: profile.provider,
          strategy: profile.strategy,
          capabilities: profile.capabilities,
          estimate30sBudget: estimateRunCost(
            { budgetMode: true, durationSeconds: 30 },
            profileToProductionCostConfig(profile, baseConfig)
          )
        }))
      };
    });

    adminRoutes.get("/config/cost", async () => {
      const tenant = await prisma.tenant.findFirst({ where: { slug: process.env.DEFAULT_TENANT_SLUG ?? "demo" } });
      const provider = tenant ? await createProvidersRepo(tenant.id).primary("GEMINI") : null;
      const videoModel = geminiModels(provider).video;
      const config = buildProductionCostConfig(videoModel);
      return {
        config,
        examples: {
          budget30s: estimateRunCost({ budgetMode: true, durationSeconds: 30 }, config),
          normal30s: estimateRunCost({ budgetMode: false, durationSeconds: 30 }, config)
        }
      };
    });

    adminRoutes.get("/runs/log-matrix", async () => getRunsLogMatrix(100));

    adminRoutes.get("/runs", async () => {
      const rows = await prisma.projectRun.findMany({
        include: { stages: true, user: true },
        orderBy: { updatedAt: "desc" },
        take: 100
      });
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        currentStage: r.currentStage,
        title: (r.brief as { title?: string })?.title ?? "(untitled)",
        renderProfile: (r.brief as { renderProfile?: string })?.renderProfile ?? null,
        userEmail: r.user?.email ?? null,
        updatedAt: r.updatedAt.toISOString()
      }));
    });

    adminRoutes.get("/runs/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const view = await getRun(id);
      if (!view) {
        reply.code(404);
        return { error: "not_found" };
      }
      const ledger = await getRunCostLedger(id);
      return { ...view, actualTotalNis: ledger.summary.totalNis };
    });

    adminRoutes.get("/runs/:id/cost-events", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const run = await prisma.projectRun.findUnique({ where: { id } });
      if (!run) {
        reply.code(404);
        return { error: "not_found" };
      }
      return getRunCostLedger(id);
    });

    adminRoutes.get("/runs/:id/gemini-operations", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const rows = await prisma.artifact.findMany({
        where: { runId: id, kind: "gemini_operation" },
        orderBy: { createdAt: "asc" }
      });
      return rows.map((row) => ({
        id: row.id,
        stage: row.stage,
        gcsPath: row.gcsPath,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString()
      }));
    });

    adminRoutes.get("/dashboard", async (request) => {
      await auditAdmin(request.user!.sub, "ADMIN_SENSITIVE_VIEW", "dashboard");
      return getAdminDashboard();
    });
    adminRoutes.get("/users", async (request) => {
      const query = z
        .object({
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          search: z.string().trim().max(200).optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional()
        })
        .parse(request.query);
      await auditAdmin(request.user!.sub, "ADMIN_SENSITIVE_VIEW", "users", undefined, {
        page: query.page,
        hasSearch: Boolean(query.search)
      });
      return getAdminUsers(query);
    });
    adminRoutes.get("/metrics", async (request) => {
      const now = new Date();
      const query = z
        .object({
          from: z.coerce.date().default(new Date(now.getTime() - 30 * 86_400_000)),
          to: z.coerce.date().default(now),
          bucket: z.enum(["day", "week"]).default("day")
        })
        .refine((value) => value.from <= value.to, "from must be before to")
        .refine((value) => value.to.getTime() - value.from.getTime() <= 366 * 86_400_000, "date range is too large")
        .parse(request.query);
      await auditAdmin(request.user!.sub, "ADMIN_SENSITIVE_VIEW", "metrics", undefined, {
        from: query.from.toISOString(),
        to: query.to.toISOString()
      });
      return getAdminOperationalMetrics(query.from, query.to, query.bucket);
    });

    adminRoutes.get("/providers", async (request) => {
      await auditAdmin(request.user!.sub, "ADMIN_SENSITIVE_VIEW", "provider_monitor");
      return prisma.providerMonitor.findMany({
        orderBy: [{ enabled: "desc" }, { displayName: "asc" }],
        include: { snapshots: { orderBy: { checkedAt: "desc" }, take: 1 } }
      });
    });

    adminRoutes.post("/providers/refresh", async (request) => {
      await auditAdmin(request.user!.sub, "PROVIDER_MONITOR_REFRESH", "provider_monitor");
      await pollProviderMonitors();
      return { ok: true };
    });

    adminRoutes.patch("/providers/:id/thresholds", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          warningThreshold: z.number().nonnegative().nullable(),
          criticalThreshold: z.number().nonnegative().nullable(),
          enabled: z.boolean().optional()
        })
        .refine(
          (value) =>
            value.warningThreshold === null ||
            value.criticalThreshold === null ||
            value.criticalThreshold <= value.warningThreshold,
          "critical threshold must not exceed warning threshold"
        )
        .parse(request.body);
      const updated = await prisma.providerMonitor
        .update({ where: { id }, data: body })
        .catch(() => null);
      if (!updated) return reply.code(404).send({ error: "not_found" });
      await auditAdmin(request.user!.sub, "PROVIDER_THRESHOLD_UPDATE", "provider_monitor", id, body);
      return updated;
    });

    adminRoutes.get("/alerts", async (request) => {
      const query = z
        .object({
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
          search: z.string().trim().max(200).optional()
        })
        .parse(request.query);
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: "insensitive" as const } },
                { message: { contains: query.search, mode: "insensitive" as const } }
              ]
            }
          : {})
      };
      const [total, items] = await Promise.all([
        prisma.providerAlert.count({ where }),
        prisma.providerAlert.findMany({
          where,
          include: { monitor: { select: { provider: true, displayName: true, lastErrorCode: true } } },
          orderBy: { lastSeenAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        })
      ]);
      await auditAdmin(request.user!.sub, "ADMIN_SENSITIVE_VIEW", "provider_alert");
      return { items, total, page: query.page, pageSize: query.pageSize };
    });

    adminRoutes.post("/alerts/:id/acknowledge", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const updated = await prisma.providerAlert
        .update({
          where: { id },
          data: {
            status: "ACKNOWLEDGED",
            acknowledgedAt: new Date(),
            acknowledgedById: request.user!.sub
          }
        })
        .catch(() => null);
      if (!updated) return reply.code(404).send({ error: "not_found" });
      await auditAdmin(request.user!.sub, "PROVIDER_ALERT_ACKNOWLEDGE", "provider_alert", id);
      return updated;
    });

    adminRoutes.put("/devices/:deviceId/push-token", async (request) => {
      const { deviceId } = z.object({ deviceId: z.string().min(8).max(200) }).parse(request.params);
      const { token } = z.object({ token: z.string().min(20).max(4096) }).parse(request.body);
      await prisma.adminDevice.upsert({
        where: { userId_deviceId: { userId: request.user!.sub, deviceId } },
        create: { userId: request.user!.sub, deviceId, fcmToken: token },
        update: { fcmToken: token, revokedAt: null, lastSeenAt: new Date() }
      });
      return { ok: true };
    });

    adminRoutes.get("/devices", async (request) => {
      await auditAdmin(request.user!.sub, "ADMIN_SENSITIVE_VIEW", "admin_device");
      return prisma.adminDevice.findMany({
        where: { user: { role: "ADMIN" } },
        select: {
          id: true,
          userId: true,
          deviceId: true,
          platform: true,
          lastSeenAt: true,
          revokedAt: true,
          user: { select: { email: true } }
        },
        orderBy: { lastSeenAt: "desc" }
      });
    });

    adminRoutes.delete("/devices/:deviceId", async (request) => {
      const { deviceId } = z.object({ deviceId: z.string().min(8).max(200) }).parse(request.params);
      const now = new Date();
      await prisma.$transaction([
        prisma.adminDevice.updateMany({
          where: { deviceId },
          data: { revokedAt: now, fcmToken: null }
        }),
        prisma.mobileRefreshToken.updateMany({
          where: { deviceId, revokedAt: null },
          data: { revokedAt: now }
        })
      ]);
      await auditAdmin(request.user!.sub, "ADMIN_DEVICE_REVOKE", "admin_device", deviceId);
      return { ok: true };
    });

    adminRoutes.post("/providers/:provider/billing-link", async (request, reply) => {
      const { provider } = z.object({ provider: z.string().regex(/^[a-z0-9-]+$/) }).parse(request.params);
      const url = officialBillingUrl(provider);
      if (!url) return reply.code(404).send({ error: "billing_link_unavailable" });
      await auditAdmin(request.user!.sub, "PROVIDER_BILLING_OPEN", "provider_monitor", provider);
      return { url };
    });
    adminRoutes.get("/users/:id/pnl", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      await auditAdmin(request.user!.sub, "ADMIN_SENSITIVE_VIEW", "user_pnl", id);
      const pnl = await getAdminUserPnl(id);
      if (!pnl) {
        reply.code(404);
        return { error: "not_found" };
      }
      return pnl;
    });

    adminRoutes.post("/users/:id/credits", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ delta: z.number(), note: z.string().default("") }).parse(request.body);
      const balance = await adminAdjustCredits(id, body.delta, body.note);
      await auditAdmin(request.user!.sub, "ADMIN_CREDIT_ADJUST", "user", id, {
        delta: body.delta,
        note: body.note.slice(0, 200)
      });
      return { balance };
    });

    adminRoutes.patch("/users/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = AdminUserUpdateSchema.parse(request.body);
      try {
        const updated = await updateAdminUser(id, body);
        await auditAdmin(request.user!.sub, "ADMIN_USER_UPDATE", "user", id, {
          fields: Object.keys(body)
        });
        return updated;
      } catch {
        reply.code(404);
        return { error: "not_found" };
      }
    });

    adminRoutes.get("/settings", async (request) => {
      await auditAdmin(request.user!.sub, "ADMIN_SENSITIVE_VIEW", "platform_settings");
      return getPlatformSettings();
    });

    adminRoutes.patch("/settings", async (request) => {
      const body = PlatformSettingsPatchSchema.parse(request.body);
      const updated = await updatePlatformSettings(body);
      await auditAdmin(request.user!.sub, "ADMIN_SETTINGS_UPDATE", "platform_settings", "platform", {
        fields: Object.keys(body)
      });
      return updated;
    });

    adminRoutes.get("/creative-catalog", async () => getAdminCreativeCatalog());
    adminRoutes.post("/creative-catalog/fields", async (request) => {
      await createCreativeField(CreativeFieldCreateSchema.parse(request.body));
      return getAdminCreativeCatalog();
    });
    adminRoutes.patch("/creative-catalog/fields/:id", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      await updateCreativeField(id, CreativeFieldUpdateSchema.parse(request.body));
      return getAdminCreativeCatalog();
    });
    adminRoutes.patch("/creative-catalog/fields/:id/active", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const { active } = CreativeActivePatchSchema.parse(request.body);
      await setCreativeFieldActive(id, active);
      return getAdminCreativeCatalog();
    });
    adminRoutes.delete("/creative-catalog/fields/:id", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      await deleteCreativeField(id);
      return getAdminCreativeCatalog();
    });
    adminRoutes.post("/creative-catalog/fields/reorder", async (request) => {
      await reorderCreativeFields(CreativeReorderSchema.parse(request.body).ids);
      return getAdminCreativeCatalog();
    });
    adminRoutes.post("/creative-catalog/fields/:fieldId/options", async (request) => {
      const { fieldId } = z.object({ fieldId: z.string() }).parse(request.params);
      await createCreativeOption(fieldId, CreativeOptionCreateSchema.parse(request.body));
      return getAdminCreativeCatalog();
    });
    adminRoutes.patch("/creative-catalog/options/:id", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      await updateCreativeOption(id, CreativeOptionUpdateSchema.parse(request.body));
      return getAdminCreativeCatalog();
    });
    adminRoutes.patch("/creative-catalog/options/:id/active", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const { active } = CreativeActivePatchSchema.parse(request.body);
      await setCreativeOptionActive(id, active);
      return getAdminCreativeCatalog();
    });
    adminRoutes.delete("/creative-catalog/options/:id", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      await deleteCreativeOption(id);
      return getAdminCreativeCatalog();
    });
    adminRoutes.post("/creative-catalog/fields/:fieldId/options/reorder", async (request) => {
      const { fieldId } = z.object({ fieldId: z.string() }).parse(request.params);
      await reorderCreativeOptions(fieldId, CreativeReorderSchema.parse(request.body).ids);
      return getAdminCreativeCatalog();
    });
  },
    { prefix: "/admin" }
  );
}
