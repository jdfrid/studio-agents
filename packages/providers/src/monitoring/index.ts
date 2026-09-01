import { createHash } from "node:crypto";
import { Prisma, prisma, type ProviderAlertSeverity, type ProviderMetricType } from "@studio/infra-prisma";
import { checkGcsBucket } from "../gcs.js";

export interface ProviderReading {
  provider: string;
  displayName: string;
  metricType: ProviderMetricType;
  value: number | null;
  unit?: string;
  healthy: boolean;
  source: string;
  sourceRealtime: boolean;
  details?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  billingUrl?: string;
  sourceEvent?: string;
}

export interface ProviderMonitorAdapter {
  provider: string;
  read(): Promise<ProviderReading>;
}

export interface MonitorThresholds {
  warning: number | null;
  critical: number | null;
}

const OFFICIAL_BILLING_URLS: Record<string, string> = {
  gemini: "https://console.cloud.google.com/billing",
  gcs: "https://console.cloud.google.com/billing",
  fal: "https://fal.ai/dashboard/billing",
  heygen: "https://app.heygen.com/settings/billing",
  elevenlabs: "https://elevenlabs.io/app/subscription",
  lemonsqueezy: "https://app.lemonsqueezy.com/settings/stores"
};

export function officialBillingUrl(provider: string): string | null {
  return OFFICIAL_BILLING_URLS[provider.toLowerCase()] ?? null;
}

export function calculateRunwayHours(remaining: number | null, consumed: number, elapsedHours: number): number | null {
  if (remaining === null || remaining < 0 || consumed <= 0 || elapsedHours <= 0) return null;
  const hourlyRate = consumed / elapsedHours;
  return hourlyRate > 0 ? remaining / hourlyRate : null;
}

export function severityForReading(
  reading: Pick<ProviderReading, "healthy" | "value">,
  thresholds: MonitorThresholds
): ProviderAlertSeverity | null {
  if (!reading.healthy) return "CRITICAL";
  if (reading.value === null) return null;
  if (thresholds.critical !== null && reading.value <= thresholds.critical) return "CRITICAL";
  if (thresholds.warning !== null && reading.value <= thresholds.warning) return "WARNING";
  return null;
}

function redact(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/([?&](?:key|token|api_key)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 500);
}

function fingerprint(provider: string, code: string): string {
  return createHash("sha256").update(`${provider}:${code}`).digest("hex");
}

function recommendedAction(provider: string, severity: ProviderAlertSeverity): string {
  if (severity === "RECOVERY") return "Verify queued work resumes normally.";
  if (officialBillingUrl(provider)) return "Review the provider account and use its official billing page if funding is required.";
  return "Review provider credentials, quota and service health.";
}

async function sendPushForAlert(alertId: string): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return;
  const [{ cert, getApps, initializeApp }, { getMessaging }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/messaging")
  ]);
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey })
    });
  const alert = await prisma.providerAlert.findUnique({
    where: { id: alertId },
    include: { monitor: true }
  });
  if (!alert) return;
  const devices = await prisma.adminDevice.findMany({
    where: { revokedAt: null, fcmToken: { not: null }, user: { role: "ADMIN" } },
    select: { fcmToken: true }
  });
  const tokens = devices.flatMap((device) => (device.fcmToken ? [device.fcmToken] : []));
  if (!tokens.length) return;
  const result = await getMessaging(app).sendEachForMulticast({
    tokens,
    notification: { title: alert.title, body: alert.message },
    data: {
      alertId: alert.id,
      provider: alert.monitor.provider,
      severity: alert.severity
    },
    android: { priority: alert.severity === "CRITICAL" ? "high" : "normal" }
  });
  const invalid = result.responses.flatMap((item, index) => {
    const token = tokens[index];
    return token && !item.success &&
    (item.error?.code === "messaging/registration-token-not-registered" ||
      item.error?.code === "messaging/invalid-registration-token")
      ? [token]
      : [];
  });
  await Promise.all([
    prisma.providerAlert.update({ where: { id: alert.id }, data: { pushSentAt: new Date() } }),
    invalid.length
      ? prisma.adminDevice.updateMany({ where: { fcmToken: { in: invalid } }, data: { fcmToken: null } })
      : Promise.resolve()
  ]);
}

async function upsertAlert(input: {
  monitorId: string;
  provider: string;
  severity: ProviderAlertSeverity;
  code: string;
  message: string;
  sourceEvent: string;
}) {
  const now = new Date();
  const key = fingerprint(input.provider, input.code);
  const existing = await prisma.providerAlert.findUnique({ where: { fingerprint: key } });
  const cooldownMs = Number(process.env.PROVIDER_ALERT_COOLDOWN_MS ?? 900_000);
  const shouldPush =
    !existing ||
    existing.status === "RESOLVED" ||
    existing.severity !== input.severity ||
    !existing.pushSentAt ||
    now.getTime() - existing.pushSentAt.getTime() >= cooldownMs;
  const alert = await prisma.providerAlert.upsert({
    where: { fingerprint: key },
    create: {
      monitorId: input.monitorId,
      severity: input.severity,
      fingerprint: key,
      title: `${input.provider}: ${input.severity.toLowerCase()}`,
      message: redact(input.message) ?? "Provider requires attention.",
      recommendedAction: recommendedAction(input.provider, input.severity),
      sourceEvent: input.sourceEvent
    },
    update: {
      severity: input.severity,
      status: "OPEN",
      lastSeenAt: now,
      resolvedAt: null,
      acknowledgedAt: null,
      acknowledgedById: null,
      occurrenceCount: { increment: 1 },
      message: redact(input.message),
      sourceEvent: input.sourceEvent,
      ...(shouldPush ? { pushSentAt: null } : {})
    }
  });
  if (shouldPush) await sendPushForAlert(alert.id).catch(() => undefined);
  return alert;
}

async function recoverAlerts(monitorId: string, provider: string) {
  const open = await prisma.providerAlert.findMany({
    where: { monitorId, status: { in: ["OPEN", "ACKNOWLEDGED"] }, severity: { in: ["WARNING", "CRITICAL"] } }
  });
  if (!open.length) return;
  await prisma.providerAlert.updateMany({
    where: { id: { in: open.map((alert) => alert.id) } },
    data: { status: "RESOLVED", resolvedAt: new Date() }
  });
  await upsertAlert({
    monitorId,
    provider,
    severity: "RECOVERY",
    code: "recovery",
    message: `${provider} has recovered.`,
    sourceEvent: "poll"
  });
}

export async function persistProviderReading(reading: ProviderReading) {
  const monitor = await prisma.providerMonitor.upsert({
    where: { provider: reading.provider },
    create: {
      provider: reading.provider,
      displayName: reading.displayName,
      metricType: reading.metricType,
      unit: reading.unit,
      source: reading.source,
      sourceRealtime: reading.sourceRealtime,
      billingUrl: officialBillingUrl(reading.provider)
    },
    update: {
      displayName: reading.displayName,
      metricType: reading.metricType,
      unit: reading.unit,
      source: reading.source,
      sourceRealtime: reading.sourceRealtime,
      billingUrl: officialBillingUrl(reading.provider)
    }
  });
  const recent = await prisma.providerSnapshot.findFirst({
    where: { monitorId: monitor.id, value: { not: null }, checkedAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    orderBy: { checkedAt: "asc" }
  });
  const consumed = recent?.value !== null && reading.value !== null ? Math.max(0, (recent?.value ?? 0) - reading.value) : 0;
  const elapsed = recent ? Math.max(1 / 60, (Date.now() - recent.checkedAt.getTime()) / 3_600_000) : 0;
  const runway =
    reading.metricType === "BALANCE" || reading.metricType === "QUOTA"
      ? calculateRunwayHours(reading.value, consumed, elapsed)
      : null;
  const errorMessage = redact(reading.errorMessage);
  await prisma.$transaction([
    prisma.providerSnapshot.create({
      data: {
        monitorId: monitor.id,
        value: reading.value,
        healthy: reading.healthy,
        source: reading.source,
        sourceRealtime: reading.sourceRealtime,
        estimatedRunwayHours: runway,
        details: (reading.details ?? {}) as Prisma.InputJsonValue,
        errorCode: reading.errorCode,
        errorMessage
      }
    }),
    prisma.providerMonitor.update({
      where: { id: monitor.id },
      data: {
        lastValue: reading.value,
        lastCheckedAt: new Date(),
        ...(reading.healthy ? { lastHealthyAt: new Date(), lastErrorCode: null, lastErrorMessage: null } : {}),
        ...(!reading.healthy ? { lastErrorCode: reading.errorCode ?? "provider_error", lastErrorMessage: errorMessage } : {}),
        estimatedRunwayHours: runway
      }
    })
  ]);
  const severity = severityForReading(reading, {
    warning: monitor.warningThreshold,
    critical: monitor.criticalThreshold
  });
  if (severity) {
    await upsertAlert({
      monitorId: monitor.id,
      provider: reading.provider,
      severity,
      code: reading.errorCode ?? `threshold_${severity.toLowerCase()}`,
      message: errorMessage ?? `${reading.displayName} crossed its ${severity.toLowerCase()} threshold.`,
      sourceEvent: reading.sourceEvent ?? "poll"
    });
  } else if (reading.healthy) {
    await recoverAlerts(monitor.id, reading.provider);
  }
  return monitor;
}

export async function recordProviderFailure(input: {
  provider: string;
  code: string;
  message: string;
  sourceEvent?: string;
}) {
  const reading: ProviderReading = {
    provider: input.provider.toLowerCase(),
    displayName: input.provider,
    metricType: "SERVICE_HEALTH",
    value: null,
    healthy: false,
    source: "runtime_event",
    sourceRealtime: true,
    errorCode: input.code,
    errorMessage: input.message,
    sourceEvent: input.sourceEvent ?? "runtime"
  };
  await persistProviderReading(reading);
}

async function jsonRequest(url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; body: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function envHealthAdapter(config: {
  provider: string;
  displayName: string;
  envKey: string;
  url?: string;
  headers?: () => Record<string, string>;
  parseValue?: (body: any) => number | null;
  metricType?: ProviderMetricType;
  unit?: string;
  source?: string;
}): ProviderMonitorAdapter {
  return {
    provider: config.provider,
    async read() {
      const configured = Boolean(process.env[config.envKey]?.trim());
      if (!configured || !config.url) {
        return {
          provider: config.provider,
          displayName: config.displayName,
          metricType: config.metricType ?? "SERVICE_HEALTH",
          value: null,
          unit: config.unit,
          healthy: configured,
          source: configured ? "configuration_check" : "not_configured",
          sourceRealtime: true,
          errorCode: configured ? undefined : "not_configured",
          errorMessage: configured ? undefined : `${config.envKey} is not configured`
        };
      }
      const result = await jsonRequest(config.url, config.headers?.() ?? {});
      return {
        provider: config.provider,
        displayName: config.displayName,
        metricType: config.metricType ?? "SERVICE_HEALTH",
        value: config.parseValue?.(result.body) ?? null,
        unit: config.unit,
        healthy: result.ok,
        source: config.source ?? "official_api",
        sourceRealtime: true,
        details: { httpStatus: result.status },
        errorCode: result.ok ? undefined : `http_${result.status}`,
        errorMessage: result.ok ? undefined : `${config.displayName} health request failed`
      };
    }
  };
}

export function createDefaultMonitorAdapters(): ProviderMonitorAdapter[] {
  const geminiKey = () =>
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  const apiHealthUrl = process.env.API_HEALTH_URL
    ? new URL("/health", process.env.API_HEALTH_URL).toString()
    : undefined;
  return [
    envHealthAdapter({
      provider: "gemini",
      displayName: "Gemini / Omni / Veo",
      envKey: process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" : process.env.GOOGLE_AI_API_KEY ? "GOOGLE_AI_API_KEY" : "GOOGLE_API_KEY",
      url: geminiKey() ? `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey())}` : undefined
    }),
    {
      provider: "gcs",
      async read() {
        try {
          const bucket = await checkGcsBucket();
          const spend = await prisma.costEvent.aggregate({
            where: {
              activityType: { in: ["gcs_upload", "gcs_storage"] },
              startedAt: { gte: new Date(Date.now() - 24 * 3_600_000) }
            },
            _sum: { costNis: true }
          });
          return {
            provider: "gcs",
            displayName: "Google Cloud Storage",
            metricType: "SERVICE_HEALTH",
            value: null,
            healthy: bucket.exists,
            source: "gcs_bucket_api",
            sourceRealtime: true,
            details: { ...bucket, estimatedCostNis24h: spend._sum.costNis ?? 0 },
            errorCode: bucket.exists ? undefined : "bucket_not_found",
            errorMessage: bucket.exists ? undefined : "Configured GCS bucket was not found"
          };
        } catch (error) {
          return {
            provider: "gcs",
            displayName: "Google Cloud Storage",
            metricType: "SERVICE_HEALTH",
            value: null,
            healthy: false,
            source: "gcs_bucket_api",
            sourceRealtime: true,
            errorCode: "gcs_unavailable",
            errorMessage: error instanceof Error ? error.message : "GCS check failed"
          };
        }
      }
    },
    envHealthAdapter({ provider: "fal", displayName: "fal.ai", envKey: "FAL_API_KEY" }),
    envHealthAdapter({
      provider: "heygen",
      displayName: "HeyGen",
      envKey: "HEYGEN_API_KEY",
      url: process.env.HEYGEN_API_KEY ? "https://api.heygen.com/v2/user/remaining_quota" : undefined,
      headers: () => ({ "X-Api-Key": process.env.HEYGEN_API_KEY ?? "" }),
      parseValue: (body) => (typeof body?.data?.remaining_quota === "number" ? body.data.remaining_quota : null),
      metricType: "QUOTA",
      unit: "credits"
    }),
    envHealthAdapter({
      provider: "elevenlabs",
      displayName: "ElevenLabs",
      envKey: "ELEVENLABS_API_KEY",
      url: process.env.ELEVENLABS_API_KEY ? "https://api.elevenlabs.io/v1/user/subscription" : undefined,
      headers: () => ({ "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" }),
      parseValue: (body) =>
        typeof body?.character_limit === "number" && typeof body?.character_count === "number"
          ? body.character_limit - body.character_count
          : null,
      metricType: "QUOTA",
      unit: "characters"
    }),
    envHealthAdapter({
      provider: "lemonsqueezy",
      displayName: "Lemon Squeezy",
      envKey: "LEMONSQUEEZY_API_KEY",
      url: process.env.LEMONSQUEEZY_API_KEY ? "https://api.lemonsqueezy.com/v1/users/me" : undefined,
      headers: () => ({
        Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY ?? ""}`,
        Accept: "application/vnd.api+json"
      })
    }),
    {
      provider: "postgresql",
      async read() {
        const started = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return {
          provider: "postgresql",
          displayName: "PostgreSQL",
          metricType: "SERVICE_HEALTH",
          value: null,
          healthy: true,
          source: "sql_probe",
          sourceRealtime: true,
          details: { latencyMs: Date.now() - started }
        };
      }
    },
    {
      provider: "redis",
      async read() {
        const { default: Redis } = await import("ioredis");
        const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
          lazyConnect: true,
          connectTimeout: 5_000,
          maxRetriesPerRequest: 0
        });
        const started = Date.now();
        try {
          await client.connect();
          const response = await client.ping();
          return {
            provider: "redis",
            displayName: "Redis",
            metricType: "SERVICE_HEALTH",
            value: null,
            healthy: response === "PONG",
            source: "redis_ping",
            sourceRealtime: true,
            details: { latencyMs: Date.now() - started }
          };
        } finally {
          client.disconnect();
        }
      }
    },
    envHealthAdapter({
      provider: "api",
      displayName: "API",
      envKey: "API_HEALTH_URL",
      url: apiHealthUrl
    }),
    {
      provider: "worker",
      async read() {
        return {
          provider: "worker",
          displayName: "Worker",
          metricType: "SERVICE_HEALTH",
          value: null,
          healthy: true,
          source: "worker_self_check",
          sourceRealtime: true
        };
      }
    }
  ];
}

export async function pollProviderMonitors(adapters = createDefaultMonitorAdapters()) {
  return Promise.all(
    adapters.map(async (adapter) => {
      try {
        return await persistProviderReading(await adapter.read());
      } catch (error) {
        await recordProviderFailure({
          provider: adapter.provider,
          code: "monitor_failed",
          message: error instanceof Error ? error.message : "Provider monitor failed",
          sourceEvent: "poll"
        });
        return null;
      }
    })
  );
}
