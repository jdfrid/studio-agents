import { prisma } from "@studio/infra-prisma";
import {
  computeCostAmounts,
  summarizeRunCosts,
  type CostEventSummary,
  type CostEventView,
  type CostRecorder,
  type CostUsageRecord,
  type StageName
} from "@studio/shared";
import { fromPrismaStage } from "./stageMap.js";

export interface CostRecorderContext {
  tenantId: string;
  runId: string;
  stage: StageName;
  stageExecutionId: string;
  attempt: number;
}

export function createCostRecorder(ctx: CostRecorderContext): CostRecorder {
  return {
    async record(event: CostUsageRecord): Promise<void> {
      const { costUsd, costNis, charged } = computeCostAmounts(event.activityType, event.billedUnits, {
        model: event.model ?? undefined,
        generateAudio: event.generateAudio,
        charged: event.charged
      });
      await prisma.costEvent.create({
        data: {
          tenantId: ctx.tenantId,
          runId: ctx.runId,
          stageExecutionId: ctx.stageExecutionId,
          attempt: ctx.attempt,
          stage: ctx.stage as never,
          activityType: event.activityType as never,
          sceneId: event.sceneId ?? null,
          model: event.model ?? null,
          startedAt: event.startedAt ?? new Date(),
          durationMs: event.durationMs ?? null,
          billedUnits: event.billedUnits,
          unit: event.unit as never,
          costUsd,
          costNis,
          charged: charged as never,
          metadata: (event.metadata ?? {}) as object
        }
      });
    }
  };
}

export function noopCostRecorder(): CostRecorder {
  return { async record() {} };
}

function rowToCostEventView(row: {
  id: string;
  tenantId: string;
  runId: string;
  stageExecutionId: string | null;
  attempt: number;
  stage: string;
  activityType: string;
  sceneId: string | null;
  model: string | null;
  startedAt: Date;
  durationMs: number | null;
  billedUnits: number;
  unit: string;
  costUsd: number;
  costNis: number;
  charged: string;
  metadata: unknown;
}): CostEventView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    runId: row.runId,
    stageExecutionId: row.stageExecutionId,
    attempt: row.attempt,
    stage: fromPrismaStage(row.stage as never) as StageName,
    activityType: row.activityType as CostEventView["activityType"],
    sceneId: row.sceneId,
    model: row.model,
    startedAt: row.startedAt,
    durationMs: row.durationMs,
    billedUnits: row.billedUnits,
    unit: row.unit as CostEventView["unit"],
    costUsd: row.costUsd,
    costNis: row.costNis,
    charged: row.charged as CostEventView["charged"],
    metadata: (row.metadata as Record<string, unknown>) ?? {}
  };
}

export async function listCostEventsForRun(runId: string) {
  return prisma.costEvent.findMany({
    where: { runId },
    orderBy: { startedAt: "asc" }
  });
}

export async function getRunCostLedger(runId: string): Promise<{ events: CostEventView[]; summary: CostEventSummary }> {
  const rows = await listCostEventsForRun(runId);
  const events = rows.map(rowToCostEventView);
  return { events, summary: summarizeRunCosts(events) };
}
