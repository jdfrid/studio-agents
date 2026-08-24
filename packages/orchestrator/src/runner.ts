import { prisma } from "@studio/infra-prisma";
import {
  STAGE_ORDER,
  buildStageErrorRecord,
  createConsoleLogger,
  creativeFlagOn,
  geminiVoiceNameFromCreative,
  buildTtsDeliveryStyle,
  geminiDialogueVoicePair,
  nextStage,
  resolveRenderProfile,
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
  shouldWaitForApproval,
  maybeAutoApprove
} from "./runService.js";
import { fromPrismaStage, toPrismaStage } from "./stageMap.js";

export async function runStage(runId: string, stage: StageName): Promise<void> {
  const agent = getAgent(stage);
  if (!agent) {
    throw new Error(`No agent registered for stage ${stage}`);
  }
  const run = await prisma.projectRun.findUnique({ where: { id: runId }, include: { stages: true } });
  if (!run || run.status === "CANCELLED") {
    return;
  }
  const stageRow = run.stages.find((s) => fromPrismaStage(s.stage) === stage);
  if (!stageRow) throw new Error(`StageExecution missing for run ${runId} stage ${stage}`);
  if (stageRow.status === "CANCELLED") return;

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
    const approvalMode = (run.approvalMode ?? (run.brief as { approvalMode?: string })?.approvalMode ?? "manual") as
      | "manual"
      | "auto"
      | "auto_until_render";
    const requiresApproval = shouldWaitForApproval(stage, approvalMode);
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
    await recordStageError(stageRow.id, buildStageErrorRecord(error));
    await setRunStatus(runId, "FAILED", stage);
    const message = error instanceof Error ? error.message : String(error);
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
      const script = byName.get("script") as {
        scenes: Array<{
          id: string;
          narration: string;
          durationSeconds: number;
          audioPolicy?: string;
          speaker?: "a" | "b" | "narrator";
          speakerName?: string;
        }>;
        musicPrompt: string;
        characterBible?: string;
      } | undefined;
      const briefData = (byName.get("brief") ?? brief) as {
        language?: string;
        title?: string;
        summary?: string;
        toneOfVoice?: string;
        style?: string;
        voiceCloneSample?: { name: string; gcsPath: string; mimeType: string } | null;
        ttsVoiceName?: string | null;
        branding?: {
          businessName?: string;
          slogan?: string;
          websiteUrl?: string;
        } | null;
        creative?: Parameters<typeof geminiVoiceNameFromCreative>[0];
      };
      const briefInput = brief as { creative?: Parameters<typeof geminiVoiceNameFromCreative>[0] };
      const creative = briefData.creative ?? briefInput.creative;
      const pair = geminiDialogueVoicePair(creative, script?.characterBible);
      const voiceName = briefData.ttsVoiceName ?? pair.primary;
      const voiceNameB = pair.secondary;
      const voiceStyle = buildTtsDeliveryStyle({
        creative,
        title: briefData.title,
        summary: briefData.summary,
        toneOfVoice: briefData.toneOfVoice,
        style: briefData.style
      });
      const brand = briefData.branding;
      const lang = (briefData.language ?? "he").toLowerCase();
      const visitPrefix = lang.startsWith("en") ? "Visit" : "בקרו ב־";
      const brandParts = [
        brand?.businessName?.trim(),
        brand?.slogan?.trim(),
        brand?.websiteUrl?.trim()
          ? `${visitPrefix} ${brand.websiteUrl.trim().replace(/^https?:\/\//i, "")}`
          : null
      ].filter(Boolean);
      const brandEndNarration = brandParts.length ? brandParts.join(". ") : undefined;
      return {
        language: briefData.language ?? "he",
        scenes: (script?.scenes ?? []).map((scene) => {
          const speaker = scene.speaker ?? "narrator";
          const sceneVoice =
            speaker === "b" ? voiceNameB : speaker === "a" || speaker === "narrator" ? voiceName : voiceName;
          return {
            sceneId: scene.id,
            narration: scene.narration,
            durationSeconds: scene.durationSeconds,
            audioPolicy: scene.audioPolicy,
            speaker,
            ...(scene.speakerName ? { speakerName: scene.speakerName } : {}),
            ...(sceneVoice ? { voiceName: sceneVoice } : {})
          };
        }),
        musicPrompt: script?.musicPrompt ?? "",
        voiceCloneSample: briefData.voiceCloneSample ?? null,
        ...(voiceName ? { voiceName } : {}),
        ...(voiceNameB ? { voiceNameB } : {}),
        ...(voiceStyle ? { voiceStyle } : {}),
        ...(brandEndNarration ? { brandEndNarration } : {})
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
          sceneKind?: "beat" | "title_card";
          speaker?: "a" | "b" | "narrator";
        }>;
        backgroundVisualPrompt?: string;
        characterBible?: string;
      } | undefined;
      const briefData = (byName.get("brief") ?? brief) as {
        aspectRatio?: string;
        budgetMode?: boolean;
        visualAnchors?: Array<{ gcsPath: string; role?: string; sceneId?: string }>;
      };
      const sceneOverride = new Map<string, string>();
      const visualAnchorGcsPaths: string[] = [];
      const visualProductGcsPaths: string[] = [];
      let visualAnchorGcsPath: string | undefined;
      for (const anchor of briefData.visualAnchors ?? []) {
        if (anchor.role === "scene" && anchor.sceneId) {
          sceneOverride.set(anchor.sceneId, anchor.gcsPath);
        } else if (anchor.role === "product" && anchor.gcsPath) {
          visualProductGcsPaths.push(anchor.gcsPath);
        } else if (anchor.gcsPath) {
          visualAnchorGcsPaths.push(anchor.gcsPath);
          if (!visualAnchorGcsPath) visualAnchorGcsPath = anchor.gcsPath;
        }
      }
      return {
        aspectRatio: briefData.aspectRatio ?? "9:16",
        budgetMode: briefData.budgetMode ?? false,
        backgroundVisualPrompt: script?.backgroundVisualPrompt,
        characterBible: script?.characterBible,
        visualAnchorGcsPath,
        visualAnchorGcsPaths,
        visualProductGcsPaths,
        scenes: (script?.scenes ?? [])
          .filter((scene) => scene.sceneKind !== "title_card")
          .map((scene) => ({
            sceneId: scene.id,
            visualPrompt: scene.visualPrompt,
            veoPrompt: scene.veoPrompt,
            referenceImagePrompt: scene.referenceImagePrompt,
            firstFramePrompt: scene.firstFramePrompt,
            lastFramePrompt: scene.lastFramePrompt,
            preferredKind: "image" as const,
            ...(scene.speaker ? { speaker: scene.speaker } : {}),
            uploadedAssetGcsPath: sceneOverride.get(scene.id)
          }))
      };
    }
    case "package": {
      const briefOut = (byName.get("brief") ?? brief) as Record<string, unknown>;
      const briefInput = brief as { creative?: unknown };
      return {
        brief: {
          ...briefOut,
          creative: briefOut.creative ?? briefInput.creative
        },
        script: byName.get("script"),
        audio: byName.get("audio"),
        asset: byName.get("asset")
      };
    }
    case "render": {
      const pkg = byName.get("package") as { timeline: unknown[] } | undefined;
      const briefOut = byName.get("brief") as { aspectRatio?: string; renderProfile?: string } | undefined;
      const audioOut = byName.get("audio") as {
        brandEnd?: {
          narration?: string;
          voiceGcsPath?: string | null;
          voiceDurationSeconds?: number | null;
        } | null;
      } | undefined;
      const briefData = (byName.get("brief") ?? brief) as {
        aspectRatio?: string;
        renderProfile?: string;
        language?: string;
        videoInsert?: {
          name: string;
          gcsPath: string;
          mimeType: string;
          insertAtSeconds: number;
          audioSource: "clip" | "narration";
        } | null;
        branding?: {
          businessName?: string;
          slogan?: string;
          websiteUrl?: string;
          logo?: { name: string; gcsPath: string; mimeType: string } | null;
          logoPlacement?: "none" | "always" | "end_only" | "open_and_end";
        } | null;
        creative?: {
          karaokeCaptions?: string;
          sideWatermark?: string;
          preferHeygenDub?: string;
          lowerThirds?: string;
          filmTemplate?: string;
        } | null;
      };
      const briefInput = brief as { creative?: typeof briefData.creative; language?: string };
      const creative = briefData.creative ?? briefInput.creative ?? null;
      const karaokeCaptions = creativeFlagOn(creative, "karaokeCaptions", true);
      const sideWatermark =
        creativeFlagOn(creative, "sideWatermark") || briefData.branding?.logoPlacement === "always";
      const lowerThirds =
        creativeFlagOn(creative, "lowerThirds") || creative?.filmTemplate === "corporate_product";
      const renderProfile = resolveRenderProfile(briefOut ?? briefData).id;
      const brandEnd = audioOut?.brandEnd;
      return {
        aspectRatio: briefData.aspectRatio ?? "9:16",
        timeline: pkg?.timeline ?? [],
        renderProfile,
        videoInsert: briefData.videoInsert ?? null,
        branding: briefData.branding ?? null,
        brandEndVoice:
          brandEnd?.voiceGcsPath
            ? {
                gcsPath: brandEnd.voiceGcsPath,
                durationSeconds: brandEnd.voiceDurationSeconds ?? null,
                narration: brandEnd.narration
              }
            : null,
        language: briefData.language ?? briefInput.language ?? "he",
        karaokeCaptions,
        sideWatermark,
        lowerThirds
      };
    }
    case "series":
      return { runIds: [runId], transitionSeconds: 0.5 };
    default:
      void STAGE_ORDER;
      return null;
  }
}
