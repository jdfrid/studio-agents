import { Queue, type QueueOptions } from "bullmq";
import { redisConnection } from "../queue.js";

export const DISTRIBUTION_QUEUE_NAME = "distribution";

export interface DistributionJobData {
  publishJobId: string;
  poll?: boolean;
}

let queue: Queue<DistributionJobData> | null = null;

export function distributionQueue(): Queue<DistributionJobData> {
  if (queue) return queue;
  const opts: QueueOptions = {
    connection: redisConnection() as QueueOptions["connection"],
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 15_000 },
      removeOnComplete: 200,
      removeOnFail: 200
    }
  };
  queue = new Queue<DistributionJobData>(DISTRIBUTION_QUEUE_NAME, opts);
  return queue;
}

export async function enqueuePublishJob(
  publishJobId: string,
  opts: { delayMs?: number; poll?: boolean } = {}
): Promise<void> {
  const q = distributionQueue();
  const jobId = opts.poll ? `poll-${publishJobId}-${Date.now()}` : `publish-${publishJobId}`;
  if (!opts.poll) {
    const existing = await q.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "active" || state === "waiting" || state === "delayed" || state === "prioritized") return;
      try {
        await existing.remove();
      } catch {
        /* locked */
      }
    }
  }
  await q.add(
    opts.poll ? "poll" : "publish",
    { publishJobId, poll: Boolean(opts.poll) },
    { jobId, delay: opts.delayMs, attempts: opts.poll ? 1 : 2 }
  );
}

export async function getDistributionQueueStats(): Promise<{
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const counts = await distributionQueue().getJobCounts("waiting", "active", "completed", "failed", "delayed");
  return {
    queue: DISTRIBUTION_QUEUE_NAME,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0
  };
}

export async function closeDistributionQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  queue = null;
}
