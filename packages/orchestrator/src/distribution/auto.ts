import { prisma } from "@studio/infra-prisma";
import { createDistributionPackage } from "./service.js";

export async function maybeAutoDistribute(runId: string): Promise<void> {
  const run = await prisma.projectRun.findUnique({
    where: { id: runId },
    include: { artifacts: { where: { kind: { in: ["final_video", "series_final_video"] } }, orderBy: { createdAt: "desc" } } }
  });
  if (!run?.userId) return;
  const rule = await prisma.distributeRule.findUnique({ where: { tenantId: run.tenantId } });
  if (!rule?.enabled || !rule.destinationIds.length) return;
  const artifact = run.artifacts[0];
  if (!artifact) return;
  const brief = run.brief as { title?: string; sourceText?: string; language?: string; branding?: { websiteUrl?: string } };
  try {
    await createDistributionPackage(run.userId, {
      source: "run",
      runId: run.id,
      artifactId: artifact.id,
      media: [],
      destinationIds: rule.destinationIds,
      mode: rule.requireApproval ? "draft" : "now",
      confirmLossy: !rule.requireApproval,
      copy: {
        title: brief.title,
        body: brief.sourceText?.slice(0, 1800),
        hashtags: [],
        mentions: [],
        language: brief.language,
        link: brief.branding?.websiteUrl
      }
    });
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        tenantId: run.tenantId,
        action: "distribution_auto_failed",
        entity: "ProjectRun",
        entityId: run.id,
        metadata: { error: error instanceof Error ? error.message : String(error) }
      }
    });
  }
}
