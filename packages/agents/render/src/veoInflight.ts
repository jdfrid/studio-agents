import IORedis from "ioredis";

const LOCK_KEY = "studio:veo:inflight";
const LOCK_TTL_MS = 15 * 60 * 1000;

let redis: IORedis | null = null;

function redisClient(): IORedis {
  if (redis) return redis;
  const url = process.env.REDIS_URL ?? "redis://localhost:6380";
  const opts = url.startsWith("rediss://")
    ? { maxRetriesPerRequest: null, tls: {} }
    : { maxRetriesPerRequest: null };
  redis = new IORedis(url, opts);
  return redis;
}

export function veoSceneGapMs(): number {
  const n = Number(process.env.GEMINI_VEO_SCENE_GAP_MS ?? 20_000);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 120_000) : 20_000;
}

export function veoMaxInflight(): number {
  const n = Number(process.env.GEMINI_VEO_MAX_INFLIGHT ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 8) : 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireVeoSlot(log?: (msg: string, meta?: Record<string, unknown>) => Promise<void>): Promise<void> {
  const max = veoMaxInflight();
  const client = redisClient();
  // Busy-wait with short sleep until under the global Veo concurrency cap.
  for (;;) {
    const n = await client.incr(LOCK_KEY);
    if (n === 1) {
      await client.pexpire(LOCK_KEY, LOCK_TTL_MS);
    } else {
      // Refresh TTL while the counter is live so a crashed worker cannot stick forever.
      const ttl = await client.pttl(LOCK_KEY);
      if (ttl < 0) await client.pexpire(LOCK_KEY, LOCK_TTL_MS);
    }
    if (n <= max) return;
    await client.decr(LOCK_KEY);
    await log?.("Waiting for global Veo slot", { inflightAttempt: n, maxInflight: max });
    await sleep(2500);
  }
}

async function releaseVeoSlot(): Promise<void> {
  const client = redisClient();
  const n = await client.decr(LOCK_KEY);
  if (n <= 0) {
    await client.del(LOCK_KEY);
  }
}

/** Serialize / throttle Veo generations across workers; optional gap since last Veo call. */
export async function withVeoInflightGate<T>(
  opts: {
    applySceneGap: boolean;
    log?: (event: string, message: string, meta?: Record<string, unknown>) => Promise<void>;
  },
  fn: () => Promise<T>
): Promise<T> {
  if (opts.applySceneGap) {
    const gap = veoSceneGapMs();
    if (gap > 0) {
      await opts.log?.("veo_scene_gap", "Pacing before next Veo scene", { gapMs: gap });
      await sleep(gap);
    }
  }

  await acquireVeoSlot(async (message, meta) => {
    await opts.log?.("veo_inflight_wait", message, meta);
  });
  try {
    return await fn();
  } finally {
    await releaseVeoSlot();
  }
}
