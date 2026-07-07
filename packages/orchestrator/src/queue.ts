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

export async function enqueueStage(stage: StageName, data: StageJobData): Promise<void> {
  const queue = queueFor(stage);
  const jobId = `${data.runId}:${stage}`;
  const existing = await queue.getJob(jobId);
  if (existing) await existing.remove();
  await queue.add(`run-${data.runId}`, data, { jobId });
}

export async function shutdownQueues(): Promise<void> {
  for (const q of queues.values()) {
    await q.close();
  }
  queues.clear();
  if (connection) {
    connection.disconnect();
    connection = null;
  }
}
