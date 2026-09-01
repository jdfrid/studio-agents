import { createHash } from "node:crypto";
import {
  Prisma,
  prisma,
  type CostActivityType,
  type ProviderAlertSeverity,
  type ProviderMetricType
} from "@studio/infra-prisma";
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
  operationalStatus?: "HEALTHY" | "DEGRADED" | "NOT_CONFIGURED" | "DISABLED" | "PERMISSION_ERROR";
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
  reading: Pick<ProviderReading, "healthy" | "value" | "operationalStatus">,
  thresholds: MonitorThresholds
): ProviderAlertSeverity | null {
  if (reading.operationalStatus === "DISABLED") return null;
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

const PROVIDER_NAMES_HE: Record<string, string> = {
  gemini: "Google Gemini ו‑Veo",
  gcs: "אחסון Google Cloud",
  fal: "fal.ai",
  heygen: "HeyGen",
  elevenlabs: "ElevenLabs",
  lemonsqueezy: "Lemon Squeezy",
  postgresql: "מסד הנתונים PostgreSQL",
  redis: "Redis",
  api: "שרת ה‑API",
  worker: "מעבד המשימות"
};

export function providerNameHe(provider: string): string {
  return PROVIDER_NAMES_HE[provider.toLowerCase()] ?? provider;
}

function recommendedAction(provider: string, severity: ProviderAlertSeverity, code: string): string {
  if (severity === "RECOVERY") return "לא נדרשת פעולה. האירוע נפתר ונשמר לצורכי מעקב.";
  if (code === "not_configured") return "יש להגדיר פרטי גישה רק אם השירות אמור להיות פעיל.";
  if (code === "upload_permission_denied")
    return "יש להעניק לחשבון השירות הרשאת storage.objects.create בדלי שהוגדר.";
  if (code.startsWith("http_401") || code.startsWith("http_403"))
    return "יש לבדוק שמפתח ה‑API תקף ושיש לו הרשאות לקריאת נתוני המנוי.";
  if (officialBillingUrl(provider))
    return "יש לבדוק את החשבון באתר הרשמי; טעינת כסף נדרשת רק אם האתר מציג יתרה או מכסה נמוכה.";
  return "יש לבדוק הרשאות, מכסה וזמינות של השירות.";
}

function alertTitle(provider: string, severity: ProviderAlertSeverity): string {
  const level = severity === "CRITICAL" ? "תקלה קריטית" : severity === "WARNING" ? "אזהרה" : "התקלה נפתרה";
  return `${providerNameHe(provider)} — ${level}`;
}

function alertMessage(provider: string, severity: ProviderAlertSeverity, code: string): string {
  if (severity === "RECOVERY") return `${providerNameHe(provider)} חזר לפעילות תקינה.`;
  if (code === "upload_permission_denied") return "אין הרשאה להעלות קבצים לדלי האחסון שהוגדר.";
  if (code === "not_configured") return "השירות לא הוגדר.";
  if (code.startsWith("http_401")) return "פרטי הגישה נדחו על ידי השירות.";
  if (code.startsWith("http_403")) return "פרטי הגישה תקפים, אך חסרה הרשאה לביצוע הבדיקה.";
  if (code.startsWith("threshold_")) return `היתרה או המכסה של ${providerNameHe(provider)} ירדה מתחת לסף שהוגדר.`;
  return `בדיקת הזמינות של ${providerNameHe(provider)} נכשלה.`;
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
      status: input.severity === "RECOVERY" ? "RESOLVED" : "OPEN",
      fingerprint: key,
      title: alertTitle(input.provider, input.severity),
      message: alertMessage(input.provider, input.severity, input.code),
      recommendedAction: recommendedAction(input.provider, input.severity, input.code),
      sourceEvent: input.sourceEvent,
      metadata: { technicalMessage: redact(input.message), errorCode: input.code }
    },
    update: {
      severity: input.severity,
      status: input.severity === "RECOVERY" ? "RESOLVED" : "OPEN",
      lastSeenAt: now,
      resolvedAt: input.severity === "RECOVERY" ? now : null,
      acknowledgedAt: null,
      acknowledgedById: null,
      occurrenceCount: { increment: 1 },
      title: alertTitle(input.provider, input.severity),
      message: alertMessage(input.provider, input.severity, input.code),
      recommendedAction: recommendedAction(input.provider, input.severity, input.code),
      metadata: { technicalMessage: redact(input.message), errorCode: input.code },
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
  const details = {
    ...(reading.details ?? {}),
    operationalStatus: reading.operationalStatus ?? (reading.healthy ? "HEALTHY" : "DEGRADED")
  };
  await prisma.$transaction([
    prisma.providerSnapshot.create({
      data: {
        monitorId: monitor.id,
        value: reading.value,
        healthy: reading.healthy,
        source: reading.source,
        sourceRealtime: reading.sourceRealtime,
        estimatedRunwayHours: runway,
        details: details as Prisma.InputJsonValue,
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

function apiFailureReason(body: any): string | undefined {
  const candidate = body?.detail?.message ?? body?.detail ?? body?.message ?? body?.error?.message ?? body?.error;
  return typeof candidate === "string" ? redact(candidate) : undefined;
}

async function estimatedInternalSpendNis24h(types: CostActivityType[]): Promise<number | null> {
  if (!types.length) return null;
  const result = await prisma.costEvent.aggregate({
    where: { activityType: { in: types }, startedAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    _sum: { costNis: true }
  });
  return result._sum.costNis ?? 0;
}

function envHealthAdapter(config: {
  provider: string;
  displayName: string;
  envKey: string;
  url?: string;
  headers?: () => Record<string, string>;
  parseValue?: (body: any) => number | null;
  parseMetricType?: (body: any) => ProviderMetricType;
  parseUnit?: (body: any) => string | undefined;
  metricType?: ProviderMetricType;
  unit?: string;
  source?: string;
  optional?: boolean;
  balanceUnavailableReason?: string;
  parseDetails?: (body: any) => Record<string, unknown>;
  internalCostTypes?: CostActivityType[];
}): ProviderMonitorAdapter {
  return {
    provider: config.provider,
    async read() {
      const configured = Boolean(process.env[config.envKey]?.trim());
      if (!configured) {
        const optional = config.optional === true;
        return {
          provider: config.provider,
          displayName: config.displayName,
          metricType: config.metricType ?? "SERVICE_HEALTH",
          value: null,
          unit: config.unit,
          healthy: optional,
          source: optional ? "optional_not_configured" : "not_configured",
          sourceRealtime: true,
          operationalStatus: optional ? "DISABLED" : "NOT_CONFIGURED",
          details: {
            configured: false,
            optional,
            balanceUnavailableReason: config.balanceUnavailableReason
          },
          errorCode: optional ? undefined : "not_configured",
          errorMessage: optional ? undefined : `${config.envKey} is not configured`
        };
      }
      if (!config.url) {
        return {
          provider: config.provider,
          displayName: config.displayName,
          metricType: config.metricType ?? "SERVICE_HEALTH",
          value: null,
          unit: config.unit,
          healthy: true,
          source: "configuration_check",
          sourceRealtime: true,
          operationalStatus: "HEALTHY",
          details: {
            configured: true,
            balanceUnavailableReason: config.balanceUnavailableReason,
            estimatedCostNis24h: await estimatedInternalSpendNis24h(config.internalCostTypes ?? [])
          }
        };
      }
      const result = await jsonRequest(config.url, config.headers?.() ?? {});
      const reason = apiFailureReason(result.body);
      return {
        provider: config.provider,
        displayName: config.displayName,
        metricType: config.parseMetricType?.(result.body) ?? config.metricType ?? "SERVICE_HEALTH",
        value: config.parseValue?.(result.body) ?? null,
        unit: config.parseUnit?.(result.body) ?? config.unit,
        healthy: result.ok,
        source: config.source ?? "official_api",
        sourceRealtime: true,
        operationalStatus: result.ok ? "HEALTHY" : "DEGRADED",
        details: {
          configured: true,
          httpStatus: result.status,
          balanceUnavailableReason: config.balanceUnavailableReason,
          ...(config.parseDetails?.(result.body) ?? {}),
          estimatedCostNis24h: await estimatedInternalSpendNis24h(config.internalCostTypes ?? []),
          ...(reason ? { failureReason: reason } : {})
        },
        errorCode: result.ok ? undefined : `http_${result.status}`,
        errorMessage: result.ok
          ? undefined
          : `${config.displayName} request failed (HTTP ${result.status})${reason ? `: ${reason}` : ""}`
      };
    }
  };
}

export function parseHeygenBilling(body: any): {
  metricType: ProviderMetricType;
  value: number | null;
  unit?: string;
  details: Record<string, unknown>;
} {
  const data = body?.data ?? {};
  if (data.billing_type === "wallet" && typeof data.wallet?.remaining_balance === "number") {
    const currency = String(data.wallet.currency ?? "credits").toUpperCase();
    return {
      metricType: currency === "USD" ? "BALANCE" : "QUOTA",
      value: data.wallet.remaining_balance,
      unit: currency,
      details: {
        billingType: "wallet",
        autoReloadEnabled: data.wallet.auto_reload?.enabled === true,
        ...(currency === "USD" ? {} : { balanceUnavailableReason: "ארנק HeyGen נקוב בקרדיטים, לא בכסף." })
      }
    };
  }
  if (data.billing_type === "subscription") {
    const premium = data.subscription?.credits?.premium_credits?.remaining;
    const addOn = data.subscription?.credits?.add_on_credits?.remaining;
    const values = [premium, addOn].filter((value): value is number => typeof value === "number");
    return {
      metricType: "QUOTA",
      value: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
      unit: "credits",
      details: {
        billingType: "subscription",
        plan: data.subscription?.plan ?? null,
        premiumCreditsRemaining: typeof premium === "number" ? premium : null,
        addOnCreditsRemaining: typeof addOn === "number" ? addOn : null,
        balanceUnavailableReason: "חשבון המנוי של HeyGen מספק קרדיטים שנותרו, לא יתרה כספית."
      }
    };
  }
  if (data.billing_type === "usage_based") {
    const current = data.usage_based?.spending_current_usd;
    const cap = data.usage_based?.spending_cap_usd;
    return {
      metricType: "QUOTA",
      value: typeof current === "number" && typeof cap === "number" ? Math.max(0, cap - current) : null,
      unit: "USD spending capacity",
      details: {
        billingType: "usage_based",
        spendingCurrentUsd: typeof current === "number" ? current : null,
        spendingCapUsd: typeof cap === "number" ? cap : null,
        remainingCredits:
          typeof data.usage_based?.remaining_credits === "number" ? data.usage_based.remaining_credits : null,
        balanceUnavailableReason: "זהו מרווח עד תקרת הוצאה, לא כסף ששולם מראש."
      }
    };
  }
  return {
    metricType: "BILLING_HEALTH",
    value: null,
    details: { billingType: data.billing_type ?? null, balanceUnavailableReason: "סוג החיוב אינו מספק יתרה כספית." }
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
      url: geminiKey() ? `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey())}` : undefined,
      balanceUnavailableReason: "Google AI אינה מספקת יתרה כספית בחשבון דרך ה‑API הזה.",
      internalCostTypes: ["veo_video", "gemini_tts", "gemini_image", "gemini_text", "gemini_music"]
    }),
    {
      provider: "gcs",
      async read() {
        try {
          const bucket = await checkGcsBucket();
          const spend = await estimatedInternalSpendNis24h(["gcs_upload", "gcs_storage"]);
          return {
            provider: "gcs",
            displayName: "Google Cloud Storage",
            metricType: "SERVICE_HEALTH",
            value: null,
            healthy: bucket.uploadAllowed,
            source: "gcs_iam_permission_test",
            sourceRealtime: true,
            operationalStatus: bucket.uploadAllowed ? "HEALTHY" : "PERMISSION_ERROR",
            details: {
              ...bucket,
              configured: true,
              estimatedCostNis24h: spend,
              balanceUnavailableReason: "Google Cloud מחייב לפי שימוש ואינו מספק יתרת ארנק לדלי דרך Storage API."
            },
            errorCode: bucket.uploadAllowed ? undefined : "upload_permission_denied",
            errorMessage: bucket.uploadAllowed
              ? undefined
              : `Service account lacks ${bucket.checkedPermission} on the configured bucket`
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "GCS check failed";
          const bucketGetOnly = /storage\.buckets\.get/i.test(message);
          return {
            provider: "gcs",
            displayName: "Google Cloud Storage",
            metricType: "SERVICE_HEALTH",
            value: null,
            healthy: bucketGetOnly,
            source: "gcs_iam_permission_test",
            sourceRealtime: true,
            operationalStatus: bucketGetOnly ? "DEGRADED" : "PERMISSION_ERROR",
            details: {
              configured: true,
              metadataPermissionMissing: bucketGetOnly,
              failureReason: message,
              balanceUnavailableReason: "Google Cloud מחייב לפי שימוש ואינו מספק יתרת ארנק לדלי דרך Storage API."
            },
            errorCode: bucketGetOnly ? undefined : "gcs_permission_check_failed",
            errorMessage: bucketGetOnly ? undefined : message
          };
        }
      }
    },
    envHealthAdapter({
      provider: "fal",
      displayName: "fal.ai",
      envKey: "FAL_API_KEY",
      optional: true,
      balanceUnavailableReason: "לא הוגדר API רשמי ומהימן לקריאת יתרה; יש לבדוק את החיוב באתר הרשמי."
    }),
    envHealthAdapter({
      provider: "heygen",
      displayName: "HeyGen",
      envKey: "HEYGEN_API_KEY",
      url: process.env.HEYGEN_API_KEY ? "https://api.heygen.com/v3/users/me" : undefined,
      headers: () => ({ "X-Api-Key": process.env.HEYGEN_API_KEY ?? "" }),
      parseValue: (body) => parseHeygenBilling(body).value,
      parseMetricType: (body) => parseHeygenBilling(body).metricType,
      parseUnit: (body) => parseHeygenBilling(body).unit,
      parseDetails: (body) => parseHeygenBilling(body).details,
      optional: true,
      balanceUnavailableReason: "סוג החיוב בחשבון קובע אם HeyGen מספק כסף, קרדיטים או תקרת הוצאה."
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
      unit: "characters",
      optional: true,
      parseDetails: (body) => ({
        characterLimit: typeof body?.character_limit === "number" ? body.character_limit : null,
        characterCount: typeof body?.character_count === "number" ? body.character_count : null,
        nextResetUnix: typeof body?.next_character_count_reset_unix === "number" ? body.next_character_count_reset_unix : null,
        subscriptionStatus: typeof body?.status === "string" ? body.status : null,
        tier: typeof body?.tier === "string" ? body.tier : null
      }),
      balanceUnavailableReason: "ElevenLabs API מספק שימוש ומכסת תווים, אך לא יתרה כספית."
    }),
    envHealthAdapter({
      provider: "lemonsqueezy",
      displayName: "Lemon Squeezy",
      envKey: "LEMONSQUEEZY_API_KEY",
      url: process.env.LEMONSQUEEZY_API_KEY ? "https://api.lemonsqueezy.com/v1/users/me" : undefined,
      headers: () => ({
        Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY ?? ""}`,
        Accept: "application/vnd.api+json"
      }),
      optional: true,
      balanceUnavailableReason: "Lemon Squeezy הוא שירות גבייה; נקודת הקצה הזו מאמתת גישה ואינה מחזירה יתרה זמינה."
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
