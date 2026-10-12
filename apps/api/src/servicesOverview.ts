import { prisma } from "@studio/infra-prisma";
import { createProvidersRepo } from "@studio/orchestrator";
import {
  geminiModels,
  getProviderInventory,
  officialBillingUrl,
  videoProviderForProfile
} from "@studio/providers";
import {
  listRenderProfiles,
  profileVideoPerSecondUsd,
  resolveRenderProfile,
  videoModelDisplay
} from "@studio/shared";

type UsageWindow = { operations: number; costUsd: number; costNis: number };
type UsageBucket = { today: UsageWindow; week: UsageWindow; month: UsageWindow };

const DAY_MS = 86_400_000;

function emptyWindow(): UsageWindow {
  return { operations: 0, costUsd: 0, costNis: 0 };
}

function emptyBucket(): UsageBucket {
  return { today: emptyWindow(), week: emptyWindow(), month: emptyWindow() };
}

function addTo(window: UsageWindow, usd: number, nis: number) {
  window.operations += 1;
  window.costUsd += usd;
  window.costNis += nis;
}

function round(bucket: UsageBucket): UsageBucket {
  const r = (w: UsageWindow) => ({
    operations: w.operations,
    costUsd: Math.round(w.costUsd * 100) / 100,
    costNis: Math.round(w.costNis * 100) / 100
  });
  return { today: r(bucket.today), week: r(bucket.week), month: r(bucket.month) };
}

/** Which paid service a cost event was billed by. */
export function costEventProvider(event: {
  activityType: string;
  model: string | null;
  metadata: unknown;
}): string {
  const meta = (event.metadata ?? {}) as Record<string, unknown>;
  const declared = typeof meta.provider === "string" ? meta.provider.toLowerCase() : "";
  if (["runway", "heygen", "fal", "elevenlabs", "openai", "anthropic", "xai"].includes(declared)) return declared;
  if (event.activityType.startsWith("gcs_")) return "gcs";
  const model = (event.model ?? "").toLowerCase();
  if (model.includes("grok_imagine")) return "runway";
  if (model.includes("heygen")) return "heygen";
  if (/fal-ai|kling|wan\/|hailuo|minimax|seedance|luma|ray\/v/.test(model)) return "fal";
  if (model.includes("eleven")) return "elevenlabs";
  return "gemini";
}

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getAdminServicesOverview() {
  const now = new Date();
  const todayStart = startOfToday(now);
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const monthStart = new Date(now.getTime() - 30 * DAY_MS);

  const tenant = await prisma.tenant.findFirst({ where: { slug: process.env.DEFAULT_TENANT_SLUG ?? "demo" } });
  const geminiCredential = tenant ? await createProvidersRepo(tenant.id).primary("GEMINI").catch(() => null) : null;

  const [inventory, monitors, events, runGroups] = await Promise.all([
    getProviderInventory(),
    prisma.providerMonitor.findMany({
      include: { snapshots: { orderBy: { checkedAt: "desc" }, take: 1 } }
    }),
    prisma.costEvent.findMany({
      where: { startedAt: { gte: monthStart } },
      select: { activityType: true, model: true, metadata: true, costUsd: true, costNis: true, startedAt: true },
      take: 100_000
    }),
    prisma.projectRun.groupBy({
      by: ["status"],
      where: { createdAt: { gte: todayStart } },
      _count: { _all: true }
    })
  ]);

  const usageByProvider = new Map<string, UsageBucket>();
  const usageByModel = new Map<string, { provider: string; activityType: string; usage: UsageBucket }>();
  const total = emptyBucket();
  for (const event of events) {
    const provider = costEventProvider(event);
    const bucket = usageByProvider.get(provider) ?? emptyBucket();
    usageByProvider.set(provider, bucket);
    const modelKey = `${provider}|${event.model ?? event.activityType}`;
    const modelEntry =
      usageByModel.get(modelKey) ?? { provider, activityType: event.activityType, usage: emptyBucket() };
    usageByModel.set(modelKey, modelEntry);
    for (const b of [bucket, modelEntry.usage, total]) {
      addTo(b.month, event.costUsd, event.costNis);
      if (event.startedAt >= weekStart) addTo(b.week, event.costUsd, event.costNis);
      if (event.startedAt >= todayStart) addTo(b.today, event.costUsd, event.costNis);
    }
  }

  const monitorByProvider = new Map(monitors.map((row) => [row.provider, row]));
  const activeProfile = resolveRenderProfile();
  const activeVideoProvider = videoProviderForProfile(activeProfile.id);

  const services = inventory.map((entry) => {
    const row = monitorByProvider.get(entry.provider);
    const snapshot = row?.snapshots[0];
    const details = (snapshot?.details ?? {}) as Record<string, unknown>;
    const status =
      entry.provider === "api"
        ? "HEALTHY"
        : typeof details.operationalStatus === "string"
          ? details.operationalStatus
          : snapshot
            ? snapshot.healthy
              ? "HEALTHY"
              : "DEGRADED"
            : entry.configured
              ? "UNKNOWN"
              : "NOT_CONFIGURED";
    return {
      provider: entry.provider,
      displayName: entry.displayName,
      company: entry.company,
      capability: entry.capability,
      category: entry.category,
      configured: entry.configured,
      status,
      healthy: entry.provider === "api" ? true : (snapshot?.healthy ?? null),
      metricType: row?.metricType ?? "SERVICE_HEALTH",
      balance: row?.lastValue ?? null,
      unit: row?.unit ?? null,
      estimatedRunwayHours: row?.estimatedRunwayHours ?? null,
      warningThreshold: row?.warningThreshold ?? null,
      criticalThreshold: row?.criticalThreshold ?? null,
      lastCheckedAt: entry.provider === "api" ? now.toISOString() : (row?.lastCheckedAt?.toISOString() ?? null),
      lastError: entry.provider === "api" ? null : (row?.lastErrorMessage ?? null),
      balanceNote: typeof details.balanceUnavailableReason === "string" ? details.balanceUnavailableReason : null,
      details,
      billingUrl: row?.billingUrl ?? officialBillingUrl(entry.provider),
      usedByActiveVideoModel: entry.provider === activeVideoProvider || entry.provider === "gemini",
      usage: round(usageByProvider.get(entry.provider) ?? emptyBucket())
    };
  });

  const geminiConfigured = services.some((s) => s.provider === "gemini" && s.configured);
  const configuredProviders = new Set(services.filter((s) => s.configured).map((s) => s.provider));
  const effectiveGemini = geminiModels(geminiCredential);

  const videoModels = listRenderProfiles().map((profile) => {
    const provider = videoProviderForProfile(profile.id);
    return {
      id: profile.id,
      label: profile.labelHe ?? profile.label,
      provider,
      model: videoModelDisplay(profile, effectiveGemini.video),
      perSecondUsd: profileVideoPerSecondUsd(profile),
      active: profile.id === activeProfile.id,
      available: provider === "gemini" ? geminiConfigured : configuredProviders.has(provider)
    };
  });

  const aiModels = [
    { role: "text", label: "טקסט / תסריט", provider: "gemini", model: effectiveGemini.text },
    { role: "tts", label: "קריינות (TTS)", provider: "gemini", model: effectiveGemini.tts },
    { role: "image", label: "תמונות", provider: "gemini", model: effectiveGemini.image },
    { role: "music", label: "מוזיקה", provider: "gemini", model: effectiveGemini.music },
    { role: "video", label: "וידאו (Gemini)", provider: "gemini", model: effectiveGemini.video }
  ];

  const models = [...usageByModel.entries()]
    .map(([key, value]) => ({
      key,
      provider: value.provider,
      activityType: value.activityType,
      model: key.split("|").slice(1).join("|"),
      usage: round(value.usage)
    }))
    .sort((a, b) => b.usage.month.costUsd - a.usage.month.costUsd);

  const runsToday = Object.fromEntries(runGroups.map((g) => [g.status, g._count._all]));

  return {
    generatedAt: now.toISOString(),
    activeRenderProfile: { id: activeProfile.id, label: activeProfile.labelHe ?? activeProfile.label },
    totals: round(total),
    runsToday,
    services,
    videoModels,
    aiModels,
    models
  };
}
