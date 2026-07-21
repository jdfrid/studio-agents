import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { StageNameSchema, CreateRunRequestSchema } from "@studio/shared";
import {
  approveStage,
  createArtifactsRepo,
  createProvidersRepo,
  createRun,
  getQueueStats,
  getRun,
  getRunCostLedger,
  rerunStage,
  updateStageOutput,
  uploadStageArtifact
} from "@studio/orchestrator";
import { prisma } from "@studio/infra-prisma";
import { checkGeminiCapabilities, geminiModels } from "@studio/providers";
import { buildProductionCostConfig, estimateRunCost } from "@studio/shared";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  app.get("/health/queues", async () => {
    const queues = await getQueueStats();
    return { ok: true, queues };
  });

  app.get("/gemini/capabilities", async () => {
    const tenant = await prisma.tenant.findFirst({ where: { slug: process.env.DEFAULT_TENANT_SLUG ?? "demo" } });
    const provider = tenant ? await createProvidersRepo(tenant.id).primary("GEMINI") : null;
    return checkGeminiCapabilities(provider);
  });

  app.get("/config/cost", async () => {
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

  app.post("/runs", async (request, reply) => {
    const body = CreateRunRequestSchema.parse(request.body);
    const view = await createRun(body);
    reply.code(201);
    return view;
  });

  app.get("/runs", async () => {
    const rows = await prisma.projectRun.findMany({
      include: { stages: true },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      currentStage: r.currentStage,
      title: (r.brief as { title?: string })?.title ?? "(untitled)",
      updatedAt: r.updatedAt.toISOString()
    }));
  });

  app.get("/runs/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const view = await getRun(id);
    if (!view) {
      reply.code(404);
      return { error: "not_found" };
    }
    const ledger = await getRunCostLedger(id);
    return { ...view, actualTotalNis: ledger.summary.totalNis };
  });

  app.get("/runs/:id/cost-events", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const run = await prisma.projectRun.findUnique({ where: { id } });
    if (!run) {
      reply.code(404);
      return { error: "not_found" };
    }
    return getRunCostLedger(id);
  });

  app.post("/runs/:id/stages/:stage/approve", async (request, reply) => {
    const { id, stage } = z.object({ id: z.string(), stage: StageNameSchema }).parse(request.params);
    const view = await approveStage(id, stage);
    if (!view) {
      reply.code(404);
      return { error: "not_found" };
    }
    return view;
  });

  app.post("/runs/:id/stages/:stage/rerun", async (request, reply) => {
    const { id, stage } = z.object({ id: z.string(), stage: StageNameSchema }).parse(request.params);
    const view = await rerunStage(id, stage);
    if (!view) {
      reply.code(404);
      return { error: "not_found" };
    }
    return view;
  });

  app.patch("/runs/:id/stages/:stage/output", async (request, reply) => {
    const { id, stage } = z.object({ id: z.string(), stage: StageNameSchema }).parse(request.params);
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

  app.post("/runs/:id/stages/:stage/artifacts", async (request, reply) => {
    const { id, stage } = z.object({ id: z.string(), stage: StageNameSchema }).parse(request.params);
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

  app.post("/runs/:id/scenes/:sceneId/regenerate-visual", async (request, reply) => {
    const { id, sceneId } = z.object({ id: z.string(), sceneId: z.string() }).parse(request.params);
    const view = await rerunStage(id, "asset");
    if (!view) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { ...view, regeneratedSceneId: sceneId, rerunStage: "asset" };
  });

  app.post("/runs/:id/scenes/:sceneId/regenerate-video", async (request, reply) => {
    const { id, sceneId } = z.object({ id: z.string(), sceneId: z.string() }).parse(request.params);
    const view = await rerunStage(id, "render");
    if (!view) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { ...view, regeneratedSceneId: sceneId, rerunStage: "render" };
  });

  app.get("/runs/:id/gemini-operations", async (request) => {
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

  app.get("/runs/:id/artifacts", async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const repo = createArtifactsRepo();
    const list = await repo.list(id);
    void reply;
    return list;
  });

  app.get("/artifacts/:id/signed-url", async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const repo = createArtifactsRepo();
    const url = await repo.signedUrl(id);
    return { url };
  });
}
