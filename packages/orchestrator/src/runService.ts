import { prisma, Prisma } from "@studio/infra-prisma";
import {
  BriefInputSchema,
  STAGE_ORDER,
  STAGE_REQUIRES_APPROVAL,
  nextStage,
  type BriefInput,
  type ProjectRunView,
  type StageName,
  type StageStatus,
  type ArtifactKind
} from "@studio/shared";
import { enqueueStage } from "./queue.js";
import { fromPrismaStage, toPrismaStage } from "./stageMap.js";
import { createArtifactsRepo } from "./repos.js";
import { downstreamStages, parseStageOutput } from "./stageOutput.js";

export async function createRun(input: { tenantSlug: string; brief: BriefInput }): Promise<ProjectRunView> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: input.tenantSlug },
    update: {},
    create: { slug: input.tenantSlug, name: input.tenantSlug }
  });
  const brief = BriefInputSchema.parse(input.brief);
  const run = await prisma.projectRun.create({
    data: {
      tenantId: tenant.id,
      status: "RUNNING",
      currentStage: "brief",
      brief: brief as object,
      stages: {
        create: STAGE_ORDER.map((stage) => ({
          stage: toPrismaStage(stage),
          status: stage === "brief" ? "QUEUED" : "PENDING"
        }))
      }
    },
    include: { stages: true }
  });
  await audit(tenant.id, "run_created", "ProjectRun", run.id, { brief });
  const briefStage = run.stages.find((s) => fromPrismaStage(s.stage) === "brief");
  try {
    await enqueueStage("brief", { runId: run.id, stage: "brief" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (briefStage) await recordStageError(briefStage.id, `enqueue_failed: ${message}`);
    await setRunStatus(run.id, "FAILED", "brief");
    throw error;
  }
  return toView(run);
}

export async function getRun(runId: string): Promise<ProjectRunView | null> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId }, include: { stages: true } });
  return run ? toView(run) : null;
}

export async function approveStage(runId: string, stage: StageName): Promise<ProjectRunView | null> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId }, include: { stages: true } });
  if (!run) return null;
  const stageRow = run.stages.find((s) => fromPrismaStage(s.stage) === stage);
  if (!stageRow || stageRow.status !== "AWAITING_APPROVAL") return toView(run);
  const next = nextStage(stage);
  if (!next) {
    await prisma.$transaction([
      prisma.stageExecution.update({ where: { id: stageRow.id }, data: { status: "COMPLETED" } }),
      prisma.projectRun.update({ where: { id: run.id }, data: { status: "COMPLETED", currentStage: null } })
    ]);
    await audit(run.tenantId, "stage_approved_terminal", "StageExecution", stageRow.id, { stage });
  } else {
    const nextStageRow = run.stages.find((s) => fromPrismaStage(s.stage) === next);
    await prisma.$transaction([
      prisma.stageExecution.update({ where: { id: stageRow.id }, data: { status: "COMPLETED" } }),
      ...(nextStageRow
        ? [
            prisma.stageExecution.update({
              where: { id: nextStageRow.id },
              data: { status: "QUEUED" }
            })
          ]
        : []),
      prisma.projectRun.update({ where: { id: run.id }, data: { currentStage: toPrismaStage(next), status: "RUNNING" } })
    ]);
    await audit(run.tenantId, "stage_approved", "StageExecution", stageRow.id, { stage, next });
    try {
      await enqueueStage(next, { runId: run.id, stage: next });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (nextStageRow) await recordStageError(nextStageRow.id, `enqueue_failed: ${message}`);
      await setRunStatus(run.id, "FAILED", next);
      throw error;
    }
  }
  return getRun(runId);
}

export async function updateStageOutput(
  runId: string,
  stage: StageName,
  output: unknown
): Promise<ProjectRunView | null> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId }, include: { stages: true } });
  if (!run) return null;
  const stageRow = run.stages.find((s) => fromPrismaStage(s.stage) === stage);
  if (!stageRow) return toView(run);

  const validated = parseStageOutput(stage, output);
  const status = shouldWaitForApproval(stage) ? "AWAITING_APPROVAL" : "COMPLETED";

  await invalidateDownstreamStages(runId, stage);
  await recordStageOutput(stageRow.id, validated, status);
  await audit(run.tenantId, "stage_output_updated", "StageExecution", stageRow.id, { stage, manual: true });
  return getRun(runId);
}

export interface StageArtifactAttachVoice {
  type: "voice";
  sceneId: string;
}
export interface StageArtifactAttachMusic {
  type: "music";
}
export interface StageArtifactAttachFrame {
  type: "referenceFrame" | "firstFrame" | "lastFrame" | "background";
  sceneId: string;
}
export interface StageArtifactAttachSceneClip {
  type: "sceneClip";
  sceneId: string;
}
export interface StageArtifactAttachFinal {
  type: "final";
}

export type StageArtifactAttach =
  | StageArtifactAttachVoice
  | StageArtifactAttachMusic
  | StageArtifactAttachFrame
  | StageArtifactAttachSceneClip
  | StageArtifactAttachFinal;

export async function uploadStageArtifact(
  runId: string,
  stage: StageName,
  input: {
    kind: string;
    filename: string;
    mimeType: string;
    body: Buffer;
    attach: StageArtifactAttach;
  }
): Promise<ProjectRunView | null> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId }, include: { stages: true } });
  if (!run) return null;
  const stageRow = run.stages.find((s) => fromPrismaStage(s.stage) === stage);
  if (!stageRow?.output) throw new Error(`Stage ${stage} has no output to attach artifact to`);

  const artifacts = createArtifactsRepo();
  const kind = resolveArtifactKind(input.attach, input.mimeType);
  const saved = await artifacts.save({
    runId,
    stage,
    kind,
    body: input.body,
    mimeType: input.mimeType,
    filename: input.filename,
    metadata: { manualUpload: true, attach: input.attach }
  });

  let signedUrl: string | null = null;
  try {
    signedUrl = await artifacts.signedUrl(saved.id);
  } catch {
    signedUrl = null;
  }
  const output = applyArtifactAttach(stageRow.output, input.attach, saved, signedUrl);
  return updateStageOutput(runId, stage, output);
}

function resolveArtifactKind(attach: StageArtifactAttach, mimeType: string): ArtifactKind {
  switch (attach.type) {
    case "voice":
      return "voice_clip";
    case "music":
      return "music_track";
    case "sceneClip":
      return "scene_rendered_clip";
    case "final":
      return "final_video";
    case "referenceFrame":
      return "scene_reference_frame";
    case "firstFrame":
      return "scene_first_frame";
    case "lastFrame":
      return "scene_last_frame";
    case "background":
      return mimeType.startsWith("video/") ? "scene_video_source" : "scene_image_source";
    default:
      return mimeType.startsWith("video/") ? "scene_video_source" : "scene_image_source";
  }
}

function applyArtifactAttach(
  rawOutput: unknown,
  attach: StageArtifactAttach,
  artifact: { id: string; gcsPath: string; mimeType: string },
  signedUrl: string | null = null
): unknown {
  const output = structuredClone(rawOutput) as Record<string, unknown>;

  if (attach.type === "music") {
    const music = (output.music ?? {}) as Record<string, unknown>;
    music.artifactId = artifact.id;
    music.gcsPath = artifact.gcsPath;
    music.requiresExternalMusic = false;
    music.unavailableReason = null;
    output.music = music;
    return output;
  }

  if (attach.type === "voice") {
    const perScene = Array.isArray(output.perScene) ? (output.perScene as Array<Record<string, unknown>>) : [];
    const row = perScene.find((s) => s.sceneId === attach.sceneId);
    if (!row) throw new Error(`Scene ${attach.sceneId} not found in audio output`);
    row.voiceArtifactId = artifact.id;
    row.voiceGcsPath = artifact.gcsPath;
    row.voiceError = null;
    output.perScene = perScene;
    return output;
  }

  if (attach.type === "sceneClip") {
    const perScene = Array.isArray(output.perScene) ? (output.perScene as Array<Record<string, unknown>>) : [];
    let row = perScene.find((s) => s.sceneId === attach.sceneId);
    if (!row) {
      row = { sceneId: attach.sceneId, durationSeconds: 0, provider: "manual" };
      perScene.push(row);
    }
    row.artifactId = artifact.id;
    row.gcsPath = artifact.gcsPath;
    output.perScene = perScene;
    return output;
  }

  if (attach.type === "final") {
    output.finalArtifactId = artifact.id;
    output.finalGcsPath = artifact.gcsPath;
    output.finalSignedUrl = null;
    return output;
  }

  const perScene = Array.isArray(output.perScene) ? (output.perScene as Array<Record<string, unknown>>) : [];
  let row = perScene.find((s) => s.sceneId === attach.sceneId);
  if (!row) {
    row = {
      sceneId: attach.sceneId,
      kind: "image",
      sourceProvider: "manual",
      sourceUrl: null,
      artifactId: artifact.id,
      gcsPath: artifact.gcsPath,
      mimeType: artifact.mimeType,
      width: null,
      height: null
    };
    perScene.push(row);
    output.perScene = perScene;
  }

  row.artifactId = artifact.id;
  row.gcsPath = artifact.gcsPath;
  row.mimeType = artifact.mimeType;
  row.kind = artifact.mimeType.startsWith("video/") ? "video" : "image";

  if (attach.type === "background") {
    return output;
  }

  const frame = {
    artifactId: artifact.id,
    gcsPath: artifact.gcsPath,
    signedUrl,
    prompt: "manual upload",
    model: "manual"
  };
  row[attach.type] = frame;
  return output;
}

async function invalidateDownstreamStages(runId: string, fromStage: StageName): Promise<void> {
  for (const stage of downstreamStages(fromStage)) {
    await prisma.stageExecution.updateMany({
      where: { runId, stage: toPrismaStage(stage), status: { not: "PENDING" } },
      data: { status: "PENDING", output: Prisma.DbNull, error: null, attempts: 0, completedAt: null, startedAt: null }
    });
  }
}

export async function rerunStage(runId: string, stage: StageName): Promise<ProjectRunView | null> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId }, include: { stages: true } });
  if (!run) return null;
  const stageRow = run.stages.find((s) => fromPrismaStage(s.stage) === stage);
  if (!stageRow) return toView(run);
  await prisma.$transaction([
    prisma.stageExecution.update({
      where: { id: stageRow.id },
      data: { status: "QUEUED", error: null, output: Prisma.DbNull, attempts: 0 }
    }),
    prisma.projectRun.update({ where: { id: run.id }, data: { currentStage: toPrismaStage(stage), status: "RUNNING" } })
  ]);
  await audit(run.tenantId, "stage_rerun", "StageExecution", stageRow.id, { stage });
  try {
    await enqueueStage(stage, { runId: run.id, stage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordStageError(stageRow.id, `enqueue_failed: ${message}`);
    await setRunStatus(run.id, "FAILED", stage);
    throw error;
  }
  return getRun(runId);
}

export function shouldWaitForApproval(stage: StageName): boolean {
  return STAGE_REQUIRES_APPROVAL[stage] === true;
}

export async function recordStageStart(stageExecutionId: string): Promise<void> {
  await prisma.stageExecution.update({
    where: { id: stageExecutionId },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } }
  });
}

export async function recordStageOutput(
  stageExecutionId: string,
  output: unknown,
  status: StageStatus
): Promise<void> {
  await prisma.stageExecution.update({
    where: { id: stageExecutionId },
    data: {
      output: output as object,
      status,
      completedAt: status === "COMPLETED" || status === "AWAITING_APPROVAL" ? new Date() : null,
      error: null
    }
  });
}

export async function recordStageError(stageExecutionId: string, error: string): Promise<void> {
  await prisma.stageExecution.update({
    where: { id: stageExecutionId },
    data: { status: "FAILED", error, completedAt: new Date() }
  });
}

export async function setRunStatus(runId: string, status: "RUNNING" | "AWAITING_APPROVAL" | "FAILED" | "COMPLETED", currentStage: StageName | null): Promise<void> {
  await prisma.projectRun.update({
    where: { id: runId },
    data: { status, currentStage: currentStage ? toPrismaStage(currentStage) : null }
  });
}

export async function audit(tenantId: string, action: string, entity: string, entityId: string | null, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { tenantId, action, entity, entityId: entityId ?? null, metadata: metadata as object }
  });
}

function toView(run: {
  id: string;
  tenantId: string;
  status: string;
  currentStage: string | null;
  brief: unknown;
  createdAt: Date;
  updatedAt: Date;
  stages: Array<{
    id: string;
    stage: string;
    status: string;
    attempts: number;
    startedAt: Date | null;
    completedAt: Date | null;
    error: string | null;
    input: unknown;
    output: unknown;
  }>;
}): ProjectRunView {
  return {
    id: run.id,
    tenantId: run.tenantId,
    status: run.status as ProjectRunView["status"],
    currentStage: run.currentStage ? (fromPrismaStage(run.currentStage as any) as StageName) : null,
    brief: BriefInputSchema.parse(run.brief),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    stages: run.stages.map((s) => ({
      id: s.id,
      stage: fromPrismaStage(s.stage as any) as StageName,
      status: s.status as StageStatus,
      attempts: s.attempts,
      startedAt: s.startedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      error: s.error ?? null,
      input: s.input ?? null,
      output: s.output ?? null
    }))
  };
}
