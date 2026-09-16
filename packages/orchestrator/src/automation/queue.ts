import { Queue, type QueueOptions } from "bullmq";
import { redisConnection } from "../queue.js";

export const AUTOMATION_QUEUE_NAME = "automation";

export type AutomationJobData =
  | { type: "tick" }
  | { type: "scan"; campaignId: string; extraUrls?: string[] }
  | { type: "produce"; campaignId: string; dayKey?: string };

let queue: Queue<AutomationJobData> | null = null;

export function automationQueue(): Queue<AutomationJobData> {
  if (queue) return queue;
  const opts: QueueOptions = {
    connection: redisConnection() as QueueOptions["connection"],
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 20_000 },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  };
  queue = new Queue<AutomationJobData>(AUTOMATION_QUEUE_NAME, opts);
  return queue;
}

export async function ensureAutomationRepeatable(): Promise<void> {
  const q = automationQueue();
  const jobs = await q.getRepeatableJobs();
  if (jobs.some((job) => job.name === "tick")) return;
  await q.add("tick", { type: "tick" }, { repeat: { every: 15 * 60_000 } });
}

export async function enqueueAutomationScan(campaignId: string, extraUrls: string[] = []): Promise<void> {
  await automationQueue().add(
    "scan",
    { type: "scan", campaignId, extraUrls },
    { jobId: `scan-${campaignId}-${Date.now()}` }
  );
}

export async function enqueueAutomationProduce(campaignId: string, dayKey?: string): Promise<void> {
  await automationQueue().add(
    "produce",
    { type: "produce", campaignId, dayKey },
    { jobId: `produce-${campaignId}-${dayKey ?? "now"}-${Date.now()}` }
  );
}

export async function getAutomationQueueStats(): Promise<{
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const counts = await automationQueue().getJobCounts("waiting", "active", "completed", "failed", "delayed");
  return {
    queue: AUTOMATION_QUEUE_NAME,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0
  };
}

export async function closeAutomationQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  queue = null;
}
