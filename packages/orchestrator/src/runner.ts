import { prisma } from "@studio/infra-prisma";
import {
  STAGE_ORDER,
  createConsoleLogger,
  formatApiErrorMessage,
  nextStage,
  type AgentContext,
  type StageName
} from "@studio/shared";
import { enqueueStage } from "./queue.js";
import { createCostRecorder } from "./costRecorder.js";
import { getAgent } from "./registry.js";
import { createArtifactsRepo, createProvidersRepo } from "./repos.js";
import { gcsClient } from "@studio/providers";
import {
  audit,
  recordStageError,
  recordStageOutput,
  recordStageStart,
  setRunStatus,
  shouldWaitForApproval
} from "./runService.js";
import { fromPrismaStage, toPrismaStage } from "./stageMap.js";

export async function runStage(runId: string, stage: StageName): Promise<void> {
  const agent = getAgent(stage);
  if (!agent) {
    throw new Error(`No agent registered for stage ${stage}`);
  }
  const run = await prisma.projectRun.findUniqueOrThrow({ where: { id: runId }, include: { stages: true } });
  const stageRow = run.stages.find((s) => fromPrismaStage(s.stage) === stage);
  if (!stageRow) throw new Error(`StageExecution missing for run ${runId} stage ${stage}`);

  await recordStageStart(stageRow.id);
  const stageExec = await prisma.stageExecution.findUniqueOrThrow({ where: { id: stageRow.id } });
  const logger = createConsoleLogger({ runId, stage });
  const cost = createCostRecorder({
    tenantId: run.tenantId,
    runId,
    stage,
    stageExecutionId: stageRow.id,
    attempt: stageExec.attempts
  });
  const ctx: AgentContext = {
    runId,
    tenantId: run.tenantId,
    stage,
    stageExecutionId: stageRow.id,
    attempt: stageExec.attempts,
    artifacts: createArtifactsRepo(cost),
    providers: createProvidersRepo(run.tenantId),
    storage: gcsClient(),
    log: logger,
    cost
  };

  const input = await collectStageInput(runId, stage, run.brief);

  try {
    agent.inputSchema.parse(input);
  } catch (error) {
    await recordStageError(stageRow.id, `Invalid stage input: ${(error as Error).message}`);
    await setRunStatus(runId, "FAILED", stage);
    await audit(run.tenantId, "stage_input_invalid", "StageExecution", stageRow.id, { stage });
    throw error;
  }

  try {
    const output = await agent.run(ctx, input);
    agent.outputSchema.parse(output);
    const requiresApproval = shouldWaitForApproval(stage);
    await recordStageOutput(stageRow.id, output, requiresApproval ? "AWAITING_APPROVAL" : "COMPLETED");
    await audit(run.tenantId, requiresApproval ? "stage_awaiting_approval" : "stage_completed", "StageExecution", stageRow.id, { stage });

    if (requiresApproval) {
      await setRunStatus(runId, "AWAITING_APPROVAL", stage);
      return;
    }
    const next = nextStage(stage);
    if (!next) {
      await setRunStatus(runId, "COMPLETED", null);
      return;
    }
    await prisma.stageExecution.update({
      where: { runId_stage: { runId, stage: toPrismaStage(next) } },
      data: { status: "QUEUED" }
    });
    await setRunStatus(runId, "RUNNING", next);
    try {
      await enqueueStage(next, { runId, stage: next });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextRow = run.stages.find((s) => fromPrismaStage(s.stage) === next);
      if (nextRow) await recordStageError(nextRow.id, `enqueue_failed: ${message}`);
      await setRunStatus(runId, "FAILED", next);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordStageError(stageRow.id, formatApiErrorMessage(message));
    await setRunStatus(runId, "FAILED", stage);
    await audit(run.tenantId, "stage_failed", "StageExecution", stageRow.id, { stage, error: message });
    throw error;
  }
}

async function collectStageInput(runId: string, stage: StageName, brief: unknown): Promise<unknown> {
  const stages = await prisma.stageExecution.findMany({ where: { runId } });
  const byName = new Map<StageName, unknown>();
  for (const s of stages) {
    byName.set(fromPrismaStage(s.stage) as StageName, s.output);
  }
  switch (stage) {
    case "brief":
      return brief;
    case "script":
      return { brief: byName.get("brief") };
    case "audio": {
      const script = byName.get("script") as { scenes: Array<{ id: string; narration: string; durationSeconds: number; audioPolicy?: string }>; musicPrompt: string } | undefined;
      const briefData = (byName.get("brief") ?? brief) as { language?: string };
      return {
        language: briefData.language ?? "he",
        scenes: (script?.scenes ?? []).map((scene) => ({
          sceneId: scene.id,
          narration: scene.narration,
          durationSeconds: scene.durationSeconds,
          audioPolicy: scene.audioPolicy
        })),
        musicPrompt: script?.musicPrompt ?? ""
      };
    }
    case "asset": {
      const script = byName.get("script") as {
        scenes: Array<{
          id: string;
          visualPrompt: string;
          veoPrompt?: string;
          referenceImagePrompt?: string;
          firstFramePrompt?: string;
          lastFramePrompt?: string;
        }>;
      } | undefined;
      const briefData = (byName.get("brief") ?? brief) as {
        aspectRatio?: string;
        budgetMode?: boolean;
        attachments?: Array<{ gcsPath?: string }>;
      };
      return {
        aspectRatio: briefData.aspectRatio ?? "9:16",
        budgetMode: briefData.budgetMode ?? false,
        scenes: (script?.scenes ?? []).map((scene, index) => ({
          sceneId: scene.id,
          visualPrompt: scene.visualPrompt,
          veoPrompt: scene.veoPrompt,
          referenceImagePrompt: scene.referenceImagePrompt,
          firstFramePrompt: scene.firstFramePrompt,
          lastFramePrompt: scene.lastFramePrompt,
          preferredKind: "image" as const,
          uploadedAssetGcsPath: briefData.attachments?.[index]?.gcsPath
        }))
      };
    }
    case "package":
      return {
        brief: byName.get("brief") ?? brief,
        script: byName.get("script"),
        audio: byName.get("audio"),
        asset: byName.get("asset")
      };
    case "render": {
      const pkg = byName.get("package") as { timeline: unknown[] } | undefined;
      const briefData = (byName.get("brief") ?? brief) as { aspectRatio?: string };
      return {
        aspectRatio: briefData.aspectRatio ?? "9:16",
        timeline: pkg?.timeline ?? []
      };
    }
    case "series":
      return { runIds: [runId], transitionSeconds: 0.5 };
    default:
      void STAGE_ORDER;
      return null;
  }
}
