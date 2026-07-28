import { prisma } from "@studio/infra-prisma";
import {
  COST_ACTIVITY_ORDER,
  STAGE_ORDER,
  runTotalDurationMs,
  stageDurationMs,
  summarizeRunCosts,
  type CostActivityType,
  type RunLogEntry,
  type RunLogMatrixResponse,
  type RunLogStageCell,
  type StageName
} from "@studio/shared";
import { fromPrismaStage } from "./stageMap.js";

export async function getRunsLogMatrix(limit = 100): Promise<RunLogMatrixResponse> {
  const rows = await prisma.projectRun.findMany({
    include: { stages: true },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  if (rows.length === 0) {
    return { runs: [], totals: { nis: 0, usd: 0, runCount: 0 } };
  }

  const runIds = rows.map((r) => r.id);
  const costRows = await prisma.costEvent.findMany({
    where: { runId: { in: runIds } },
    orderBy: { startedAt: "asc" }
  });

  const costsByRunId = new Map<string, typeof costRows>();
  for (const event of costRows) {
    const list = costsByRunId.get(event.runId) ?? [];
    list.push(event);
    costsByRunId.set(event.runId, list);
  }

  const runs: RunLogEntry[] = rows.map((run) => {
    const brief = run.brief as { title?: string; renderProfile?: string };
    const events = costsByRunId.get(run.id) ?? [];
    const summary = summarizeRunCosts(
      events.map((e) => ({
        id: e.id,
        tenantId: e.tenantId,
        runId: e.runId,
        stageExecutionId: e.stageExecutionId,
        attempt: e.attempt,
        stage: fromPrismaStage(e.stage as never) as StageName,
        activityType: e.activityType as CostActivityType,
        sceneId: e.sceneId,
        model: e.model,
        startedAt: e.startedAt,
        durationMs: e.durationMs,
        billedUnits: e.billedUnits,
        unit: e.unit as never,
        costUsd: e.costUsd,
        costNis: e.costNis,
        charged: e.charged as never,
        metadata: (e.metadata as Record<string, unknown>) ?? {}
      }))
    );

    const stageMap = new Map(run.stages.map((s) => [fromPrismaStage(s.stage as never), s]));
    const stages: RunLogStageCell[] = STAGE_ORDER.map((stageName) => {
      const stage = stageMap.get(stageName);
      const stageCosts = summary.byStage[stageName] ?? { nis: 0, usd: 0, count: 0 };
      return {
        stage: stageName,
        status: stage?.status ?? "PENDING",
        startedAt: stage?.startedAt?.toISOString() ?? null,
        completedAt: stage?.completedAt?.toISOString() ?? null,
        durationMs: stageDurationMs(stage?.startedAt ?? null, stage?.completedAt ?? null),
        costNis: stageCosts.nis,
        costUsd: stageCosts.usd,
        eventCount: stageCosts.count
      };
    });

    const costsByActivity: RunLogEntry["costsByActivity"] = {};
    for (const type of COST_ACTIVITY_ORDER) {
      const row = summary.byActivity[type];
      if (row && row.count > 0) costsByActivity[type] = row;
    }

    return {
      id: run.id,
      title: brief.title ?? "(untitled)",
      status: run.status,
      renderProfile: brief.renderProfile ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      totalDurationMs: runTotalDurationMs(
        run.createdAt,
        run.updatedAt,
        run.stages.map((s) => s.completedAt)
      ),
      totalNis: summary.totalNis,
      totalUsd: summary.totalUsd,
      stages,
      costsByActivity
    };
  });

  const totals = runs.reduce(
    (acc, run) => ({
      nis: acc.nis + run.totalNis,
      usd: acc.usd + run.totalUsd,
      runCount: acc.runCount + 1
    }),
    { nis: 0, usd: 0, runCount: 0 }
  );

  return { runs, totals };
}
