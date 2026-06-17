import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import type { StageName } from "@studio/shared";

let connection: IORedis | null = null;
const queues = new Map<StageName, Queue>();

export function redisConnection(): IORedis {
  if (connection) return connection;
  const url = process.env.REDIS_URL ?? "redis://localhost:6380";
  connection = new IORedis(url, { maxRetriesPerRequest: null });
  return connection;
}

export function queueFor(stage: StageName): Queue {
  let q = queues.get(stage);
  if (q) return q;
  const opts: QueueOptions = {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 200
    }
  };
  q = new Queue(`agent:${stage}`, opts);
  queues.set(stage, q);
  return q;
}

export interface StageJobData {
  runId: string;
  stage: StageName;
}

export async function enqueueStage(stage: StageName, data: StageJobData): Promise<void> {
  await queueFor(stage).add(`run:${data.runId}`, data, { jobId: `${data.runId}:${stage}` });
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
