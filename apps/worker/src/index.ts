import { Worker, type Job, type WorkerOptions } from "bullmq";
import { STAGE_ORDER, type StageName } from "@studio/shared";
import { refreshPlatformSettingsCache } from "@studio/billing";
import { redisConnection, registerAgent, runStage, queueName } from "@studio/orchestrator";
import { briefAgent } from "@studio/agent-brief";
import { scriptAgent } from "@studio/agent-script";
import { audioAgent } from "@studio/agent-audio";
import { assetAgent } from "@studio/agent-asset";
import { packageAgent } from "@studio/agent-package";
import { renderAgent } from "@studio/agent-render";
import { seriesAgent } from "@studio/agent-series";
import { pollProviderMonitors, recordProviderFailure } from "@studio/providers";

registerAgent(briefAgent);
registerAgent(scriptAgent);
registerAgent(audioAgent);
registerAgent(assetAgent);
registerAgent(packageAgent);
registerAgent(renderAgent);
registerAgent(seriesAgent);

const stageTimeouts: Record<StageName, number> = {
  brief: 600_000,
  script: 300_000,
  audio: 600_000,
  asset: 600_000,
  package: 60_000,
  render: 1_800_000,
  series: 900_000
};

const workers: Worker[] = [];
let monitorTimer: NodeJS.Timeout | undefined;

function classifyProviderFailure(error: Error): { provider: string; code: string } {
  const message = error.message.toLowerCase();
  const provider =
    message.includes("eleven") ? "elevenlabs" :
    message.includes("heygen") ? "heygen" :
    message.includes("fal") ? "fal" :
    message.includes("redis") ? "redis" :
    message.includes("gcs") || message.includes("storage") ? "gcs" :
    "gemini";
  const code =
    /billing|payment/.test(message) ? "billing_failure" :
    /quota|limit|resource_exhausted|429/.test(message) ? "billing_quota" :
    /unauthori|forbidden|credential|401|403/.test(message) ? "authorization_failure" :
    "provider_failure";
  return { provider, code };
}

async function main() {
  await refreshPlatformSettingsCache();
  await pollProviderMonitors();
  const intervalMs = Math.max(60_000, Number(process.env.PROVIDER_MONITOR_INTERVAL_MS ?? 300_000));
  monitorTimer = setInterval(() => {
    void pollProviderMonitors().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Provider monitor poll failed:", error);
    });
  }, intervalMs);
  monitorTimer.unref();
  for (const stage of STAGE_ORDER) {
    const w = new Worker(
      queueName(stage),
      async (job: Job<{ runId: string; stage: StageName }>) => {
        const start = Date.now();
        try {
          await runStage(job.data.runId, job.data.stage);
        } finally {
          // eslint-disable-next-line no-console
          console.log(`[worker:${stage}] job ${job.id} finished in ${Date.now() - start}ms`);
        }
      },
      {
        connection: redisConnection() as WorkerOptions["connection"],
        concurrency: stage === "render" ? 1 : 2,
        // Hailuo/Veo clips can take many minutes; renew lock so long jobs are not marked stalled.
        lockDuration: stageTimeouts[stage],
        stalledInterval: Math.min(60_000, Math.max(15_000, Math.floor(stageTimeouts[stage] / 20))),
        maxStalledCount: 2
      }
    );
    workers.push(w);
    w.on("failed", (job, err) => {
      // eslint-disable-next-line no-console
      console.error(`[worker:${stage}] job ${job?.id ?? "?"} failed:`, err);
      const classified = classifyProviderFailure(err);
      void recordProviderFailure({
        ...classified,
        message: err.message,
        sourceEvent: `worker:${stage}`
      }).catch(() => undefined);
    });
    w.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error(`[worker:${stage}] error:`, err);
    });
    // eslint-disable-next-line no-console
    console.log(`Worker started for queue: ${queueName(stage)}`);
  }
}

void main().catch((err) => {
  console.error("Worker startup failed:", err);
  process.exit(1);
});
async function shutdown() {
  // eslint-disable-next-line no-console
  console.log("Shutting down workers...");
  if (monitorTimer) clearInterval(monitorTimer);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
