import type { FastifyInstance } from "fastify";
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
  getAdminUserPnl,
  adminAdjustCredits,
  updateAdminUser,
  InsufficientCreditsError,
  getPlatformSettings,
  updatePlatformSettings
} from "@studio/billing";
import { PlatformSettingsPatchSchema, AdminUserUpdateSchema } from "@studio/shared";

async function assertRunOwner(runId: string, userId: string, role?: "USER" | "ADMIN") {
  const run = await prisma.projectRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  if (role === "ADMIN") return run;
  if (run.userId && run.userId !== userId) return null;
  return run;
}

export async function registerRoutes(app: FastifyInstance) {
  await authPlugin(app);
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

    adminRoutes.get("/dashboard", async () => getAdminDashboard());
    adminRoutes.get("/users", async () => getAdminUsers());
    adminRoutes.get("/users/:id/pnl", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
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
      return { balance };
    });

    adminRoutes.patch("/users/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = AdminUserUpdateSchema.parse(request.body);
      try {
        return await updateAdminUser(id, body);
      } catch {
        reply.code(404);
        return { error: "not_found" };
      }
    });

    adminRoutes.get("/settings", async () => getPlatformSettings());

    adminRoutes.patch("/settings", async (request) => {
      const body = PlatformSettingsPatchSchema.parse(request.body);
      return updatePlatformSettings(body);
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
