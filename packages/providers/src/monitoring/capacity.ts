import { prisma } from "@studio/infra-prisma";
import { getRenderProfile, profileVideoPerSecondUsd, type RenderProfileId } from "@studio/shared";
import {
  createDefaultMonitorAdapters,
  persistProviderReading,
  type ProviderMonitorAdapter,
  type ProviderReading
} from "./index.js";

export type CapacityBlockReason = "not_configured" | "no_funds" | "auth" | "billing_failure";

export interface CapacityBlock {
  provider: string;
  reason: CapacityBlockReason;
  balance?: number | null;
  unit?: string | null;
  requiredUsd?: number;
}

export interface CapacityResult {
  ok: boolean;
  blocked: CapacityBlock[];
}

export interface CapacityRequirement {
  provider: string;
  /** Minimum USD the provider must still hold (only enforced when the balance is reported in USD). */
  requiredUsd?: number;
}

/** Monitor provider key that pays for a render profile's video clips. */
export function videoProviderForProfile(profileId: RenderProfileId): string {
  const provider = getRenderProfile(profileId).provider;
  if (provider === "heygen") return "heygen";
  if (provider === "runway") return "runway";
  if (provider === "kling" || provider === "fal") return "fal";
  return "gemini";
}

/**
 * Providers (and minimum USD) a new run needs: the video provider for the predicted
 * profile plus Gemini, which writes the script and speaks the narration.
 */
export function capacityRequirementsForRun(profileId: RenderProfileId, durationSeconds: number): CapacityRequirement[] {
  const videoProvider = videoProviderForProfile(profileId);
  const videoUsd = profileVideoPerSecondUsd(getRenderProfile(profileId)) * Math.max(1, durationSeconds);
  const requirements: CapacityRequirement[] = [
    { provider: videoProvider, requiredUsd: Math.round(videoUsd * 100) / 100 }
  ];
  if (videoProvider !== "gemini") requirements.push({ provider: "gemini" });
  return requirements;
}

/** Decide from a single monitor reading whether the provider can pay for another run. */
export function evaluateReadingCapacity(
  reading: Pick<ProviderReading, "operationalStatus" | "source" | "errorCode" | "metricType" | "value" | "unit">,
  requiredUsd = 0
): CapacityBlockReason | null {
  if (
    reading.operationalStatus === "NOT_CONFIGURED" ||
    reading.operationalStatus === "DISABLED" ||
    reading.source === "optional_not_configured" ||
    reading.source === "not_configured"
  ) {
    return "not_configured";
  }
  if (reading.errorCode === "http_401" || reading.errorCode === "http_403") return "auth";
  if (reading.errorCode === "http_402") return "no_funds";
  if ((reading.metricType === "BALANCE" || reading.metricType === "QUOTA") && reading.value !== null) {
    if (reading.unit?.toUpperCase() === "USD") {
      if (reading.value < Math.max(0.01, requiredUsd)) return "no_funds";
    } else if (reading.value <= 0) {
      return "no_funds";
    }
  }
  return null;
}

const cache = new Map<string, { at: number; reading: ProviderReading }>();

function cacheTtlMs(): number {
  return Math.max(10_000, Number(process.env.SERVICE_CAPACITY_CACHE_MS ?? 60_000) || 60_000);
}

/** Runtime billing failures (worker saw "insufficient credit" / 402) block new runs for this window. */
function billingFailureWindowMs(): number {
  return Math.max(60_000, Number(process.env.SERVICE_CAPACITY_BILLING_WINDOW_MS ?? 600_000) || 600_000);
}

async function readWithTimeout(adapter: ProviderMonitorAdapter, ms: number): Promise<ProviderReading | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      adapter.read(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      })
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function recentBillingFailure(provider: string): Promise<boolean> {
  const since = new Date(Date.now() - billingFailureWindowMs());
  const failure = await prisma.providerSnapshot.findFirst({
    where: {
      monitor: { provider },
      source: "runtime_event",
      errorCode: "billing_failure",
      checkedAt: { gte: since }
    },
    orderBy: { checkedAt: "desc" },
    select: { checkedAt: true }
  });
  if (!failure) return false;
  const recovered = await prisma.providerSnapshot.findFirst({
    where: {
      monitor: { provider },
      source: { not: "runtime_event" },
      healthy: true,
      value: { gt: 0 },
      checkedAt: { gt: failure.checkedAt }
    },
    select: { id: true }
  });
  return !recovered;
}

/**
 * Live funds check before a run is created. Uses a short in-memory cache so a burst of
 * create clicks costs at most one provider API call per provider per minute. Monitor
 * outages fail open — only a confirmed empty balance, missing key or billing failure blocks.
 */
export async function checkServiceCapacity(requirements: CapacityRequirement[]): Promise<CapacityResult> {
  const needed = requirements.filter(
    (req, index) => requirements.findIndex((other) => other.provider === req.provider) === index
  );
  if (!needed.length || process.env.SERVICE_CAPACITY_CHECK === "0") return { ok: true, blocked: [] };

  const stale = needed.filter((req) => {
    const hit = cache.get(req.provider);
    return !hit || Date.now() - hit.at > cacheTtlMs();
  });
  if (stale.length) {
    const adapters = await createDefaultMonitorAdapters("api").catch(() => [] as ProviderMonitorAdapter[]);
    await Promise.all(
      stale.map(async (req) => {
        const adapter = adapters.find((candidate) => candidate.provider === req.provider);
        if (!adapter) {
          cache.set(req.provider, {
            at: Date.now(),
            reading: {
              provider: req.provider,
              displayName: req.provider,
              metricType: "SERVICE_HEALTH",
              value: null,
              healthy: false,
              source: "not_configured",
              sourceRealtime: true,
              operationalStatus: "NOT_CONFIGURED"
            }
          });
          return;
        }
        const reading = await readWithTimeout(adapter, 8_000);
        if (!reading) return;
        cache.set(req.provider, { at: Date.now(), reading });
        void persistProviderReading({ ...reading, sourceEvent: "run_preflight" }).catch(() => undefined);
      })
    );
  }

  const blocked: CapacityBlock[] = [];
  for (const req of needed) {
    const reading = cache.get(req.provider)?.reading;
    const reason = reading ? evaluateReadingCapacity(reading, req.requiredUsd ?? 0) : null;
    if (reason) {
      blocked.push({
        provider: req.provider,
        reason,
        balance: reading?.value ?? null,
        unit: reading?.unit ?? null,
        requiredUsd: req.requiredUsd
      });
      continue;
    }
    if (await recentBillingFailure(req.provider).catch(() => false)) {
      blocked.push({ provider: req.provider, reason: "billing_failure", requiredUsd: req.requiredUsd });
    }
  }
  return { ok: blocked.length === 0, blocked };
}

/** Drop cached readings, e.g. after an admin tops up and presses refresh. */
export function clearServiceCapacityCache(): void {
  cache.clear();
}
