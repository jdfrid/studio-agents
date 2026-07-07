import { Worker, type Job, type WorkerOptions } from "bullmq";
import { STAGE_ORDER, type StageName } from "@studio/shared";
import { redisConnection, registerAgent, runStage, queueName } from "@studio/orchestrator";
import { briefAgent } from "@studio/agent-brief";
import { scriptAgent } from "@studio/agent-script";
import { audioAgent } from "@studio/agent-audio";
import { assetAgent } from "@studio/agent-asset";
import { packageAgent } from "@studio/agent-package";
import { renderAgent } from "@studio/agent-render";
import { seriesAgent } from "@studio/agent-series";

registerAgent(briefAgent);
registerAgent(scriptAgent);
registerAgent(audioAgent);
registerAgent(assetAgent);
registerAgent(packageAgent);
registerAgent(renderAgent);
registerAgent(seriesAgent);

const stageTimeouts: Record<StageName, number> = {
  brief: 120_000,
  script: 180_000,
  audio: 600_000,
  asset: 600_000,
  package: 60_000,
  render: 1_800_000,
  series: 900_000
};

const workers: Worker[] = [];
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
      lockDuration: stageTimeouts[stage],
      stalledInterval: 30_000
    }
  );
  workers.push(w);
  w.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker:${stage}] job ${job?.id ?? "?"} failed:`, err);
  });
  w.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker:${stage}] error:`, err);
  });
  // eslint-disable-next-line no-console
  console.log(`Worker started for queue: ${queueName(stage)}`);
}

async function shutdown() {
  // eslint-disable-next-line no-console
  console.log("Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
