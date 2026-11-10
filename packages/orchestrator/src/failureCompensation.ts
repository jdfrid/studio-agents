import { prisma } from "@studio/infra-prisma";
import { sendProductionFailureEmail } from "@studio/auth";
import { fromPrismaStage } from "./stageMap.js";
import { describeProductionFailure } from "./failureReport.js";

/** Grant one free video and email the operator when a run fails before a finished video. */
export async function compensateFailedProduction(runId: string): Promise<void> {
  const claimed = await prisma.$transaction(async (tx) => {
    const run = await tx.projectRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true, userId: true, failureFreeVideoGranted: true }
    });
    if (!run || run.status !== "FAILED" || run.failureFreeVideoGranted) return false;
    const updated = await tx.projectRun.updateMany({
      where: { id: runId, failureFreeVideoGranted: false, status: "FAILED" },
      data: { failureFreeVideoGranted: true }
    });
    if (updated.count !== 1) return false;
    if (run.userId) {
      await tx.user.update({
        where: { id: run.userId },
        data: { goodwillFreeVideos: { increment: 1 } }
      });
    }
    return true;
  });
  if (!claimed) return;

  try {
    const run = await prisma.projectRun.findUnique({
      where: { id: runId },
      include: {
        stages: true,
        user: { select: { email: true, name: true } }
      }
    });
    if (!run) return;
    const brief = run.brief as { title?: string; language?: string; creative?: { contentLanguage?: string } };
    const report = describeProductionFailure({
      runId: run.id,
      title: brief.title ?? "",
      userEmail: run.user?.email ?? null,
      userName: run.user?.name ?? null,
      stage: run.currentStage ? fromPrismaStage(run.currentStage) : null,
      language: brief.creative?.contentLanguage ?? brief.language ?? null,
      freeVideoGranted: Boolean(run.userId),
      stages: run.stages.map((stage) => ({
        stage: fromPrismaStage(stage.stage),
        status: stage.status,
        error: stage.error
      }))
    });
    await sendProductionFailureEmail(report);
  } catch (error) {
    console.error(
      `[failure-compensation] email failed for ${runId}:`,
      error instanceof Error ? error.message : error
    );
  }
}
