import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import type { StageName } from "@studio/shared";

let connection: IORedis | null = null;
const queues = new Map<StageName, Queue>();

export function queueName(stage: StageName): string {
  return `agent-${stage}`;
}

export function redisConnection(): IORedis {
  if (connection) return connection;
  const url = process.env.REDIS_URL ?? "redis://localhost:6380";
  const opts = url.startsWith("rediss://")
    ? { maxRetriesPerRequest: null, tls: {} }
    : { maxRetriesPerRequest: null };
  connection = new IORedis(url, opts);
  return connection;
}

export function queueFor(stage: StageName): Queue {
  let q = queues.get(stage);
  if (q) return q;
  const opts: QueueOptions = {
    connection: redisConnection() as QueueOptions["connection"],
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 200
    }
  };
  q = new Queue(queueName(stage), opts);
  queues.set(stage, q);
  return q;
}

export interface StageJobData {
  runId: string;
  stage: StageName;
}

function attemptsFor(stage: StageName): number {
  // Paid API stages must not auto-retry — a concat failure would re-bill every scene clip.
  return stage === "render" || stage === "asset" ? 1 : 3;
}

/**
 * Enqueue a stage job. Same jobId is reused across reruns.
 * Never crash the run just because a previous job is still Redis-locked —
 * skip if already in-flight, otherwise fall back to a unique jobId.
 */
export async function enqueueStage(stage: StageName, data: StageJobData): Promise<void> {
  const queue = queueFor(stage);
  const jobId = `${data.runId}-${stage}`;
  const attempts = attemptsFor(stage);

  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting" || state === "delayed" || state === "prioritized" || state === "waiting-children") {
      // Already queued or running — do not remove (BullMQ throws "locked by another worker").
      return;
    }
    try {
      await existing.remove();
    } catch {
      // Completed/failed but still briefly locked, or race with a worker — use a unique id.
      await queue.add(`run-${data.runId}`, data, {
        jobId: `${jobId}-${Date.now()}`,
        attempts
      });
      return;
    }
  }

  try {
    await queue.add(`run-${data.runId}`, data, { jobId, attempts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists|JobId|job id/i.test(message)) {
      // Another concurrent enqueue won the race — treat as success.
      return;
    }
    if (/locked by another worker/i.test(message)) {
      await queue.add(`run-${data.runId}`, data, {
        jobId: `${jobId}-${Date.now()}`,
        attempts
      });
      return;
    }
    throw err;
  }
}

export async function getQueueStats(): Promise<
  Array<{ queue: string; waiting: number; active: number; completed: number; failed: number; delayed: number }>
> {
  const { STAGE_ORDER } = await import("@studio/shared");
  const stats = [];
  for (const stage of STAGE_ORDER) {
    const q = queueFor(stage);
    const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    stats.push({
      queue: queueName(stage),
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0
    });
  }
  const { getDistributionQueueStats } = await import("./distribution/queue.js");
  stats.push(await getDistributionQueueStats());
  return stats;
}

export async function shutdownQueues(): Promise<void> {
  for (const q of queues.values()) {
    await q.close();
  }
  queues.clear();
  const { closeDistributionQueue } = await import("./distribution/queue.js");
  await closeDistributionQueue();
  if (connection) {
    connection.disconnect();
    connection = null;
  }
}

/** Best-effort remove pending/failed jobs for a run so cancelled work stops retrying. */
export async function removeRunQueueJobs(runId: string): Promise<void> {
  const { STAGE_ORDER } = await import("@studio/shared");
  for (const stage of STAGE_ORDER) {
    const queue = queueFor(stage);
    const jobId = `${runId}-${stage}`;
    try {
      const existing = await queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state !== "active") {
          await existing.remove();
        }
      }
    } catch {
      /* ignore */
    }
    try {
      const jobs = await queue.getJobs(["waiting", "delayed", "failed", "prioritized"]);
      for (const job of jobs) {
        if (job.data?.runId === runId) {
          try {
            await job.remove();
          } catch {
            /* active/locked */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
}
