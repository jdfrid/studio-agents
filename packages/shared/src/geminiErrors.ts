export type GeminiErrorKind = "billing_quota" | "rate_limit" | "auth" | "unknown";

export type StageErrorRecord = {
  v: 1;
  friendly: string;
  raw: string;
  kind: GeminiErrorKind;
  httpStatus: number | null;
  quotaHint?: string | null;
};

export type ParsedStageError = {
  friendly: string;
  raw: string | null;
  kind: GeminiErrorKind;
  httpStatus?: number | null;
  quotaHint?: string | null;
};

/** Strong payment signals — not Google's generic "check your plan and billing details". */
const BILLING_QUOTA_PATTERNS = [
  "payment required",
  "insufficient credit",
  "insufficient balance",
  "insufficient funds",
  "not enough credit",
  "no credit remaining",
  "out of funds",
  "account disabled",
  "enable billing",
  "billing is not enabled",
  "billing account",
  "spending limit",
  "purchase credits",
  "buy credits",
  "prepay balance",
  "prepay ai studio"
];

const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "too many requests",
  "retry after",
  "per minute",
  "per day",
  "rpm",
  "tpm",
  "resource_exhausted",
  "quota exceeded",
  "exceeded your current quota"
];

export function classifyGeminiError(raw: string, httpStatus?: number): GeminiErrorKind {
  const lower = raw.toLowerCase();
  if (httpStatus === 401 || httpStatus === 403 || lower.includes("api key not valid")) return "auth";
  if (httpStatus === 402) return "billing_quota";
  // 429 + "quota exceeded" is usually RPM/TPM — not Prepay balance (even if message mentions "billing details").
  if (httpStatus === 429) {
    if (BILLING_QUOTA_PATTERNS.some((p) => lower.includes(p))) return "billing_quota";
    return "rate_limit";
  }
  if (BILLING_QUOTA_PATTERNS.some((p) => lower.includes(p))) return "billing_quota";
  if (RATE_LIMIT_PATTERNS.some((p) => lower.includes(p))) return "rate_limit";
  return "unknown";
}

export function userFacingGeminiError(raw: string, httpStatus?: number): string | null {
  const kind = classifyGeminiError(raw, httpStatus);
  switch (kind) {
    case "billing_quota":
      return [
        "ייתכן שנגמרו קרדיטים ב-Google AI Studio (Prepay) או שאין מספיק יתרה.",
        "Billing → How you pay → Prepay AI Studio → Buy credits.",
        "אם יש יתרה (למשל בתקציב Cloud) — בדוק גם Prepay AI Studio, לא רק Budgets."
      ].join(" ");
    case "rate_limit":
      return [
        "מגבלת קצב או מכסה זמנית של Gemini/Veo (429) — לא בהכרח 'נגמר כסף'.",
        "Google מחזיר 'quota exceeded' גם כשיש יתרה. המתן 5–10 דקות ולחץ Rerun.",
        "ריצות עם הרבה סצנות Veo עלולות לפגוע במכסה לדקה/ליום."
      ].join(" ");
    case "auth":
      return "בעיית הרשאה ל-Gemini API — בדוק שה-API key תקין וש-billing מחובר לפרויקט.";
    default:
      return null;
  }
}

function looksLikeApiRaw(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.startsWith("{") || t.includes('{"error"') || t.includes('"error":')) return true;
  if (/^\d{3}\s/.test(t)) return true;
  if (/generativelanguage\.googleapis\.com/i.test(t)) return true;
  if (/RESOURCE_EXHAUSTED|PERMISSION_DENIED|INVALID_ARGUMENT/i.test(t)) return true;
  return false;
}

/** Build JSON stored in StageExecution.error — preserves raw Google response. */
export function buildStageErrorRecord(error: unknown): string {
  const raw = extractErrorRaw(error);
  const httpStatus = extractHttpStatus(error, raw);
  const sanitized = sanitizeApiErrorText(raw);
  const apiRaw = looksLikeApiRaw(sanitized) ? sanitized.slice(0, 4000) : "";
  const classifyFrom = apiRaw || sanitized;
  const kind = classifyGeminiError(classifyFrom, httpStatus);
  const friendly = formatApiErrorMessage(classifyFrom) || sanitized.slice(0, 600);
  const record: StageErrorRecord = {
    v: 1,
    friendly,
    raw: apiRaw,
    kind,
    httpStatus: httpStatus ?? null,
    quotaHint: apiRaw ? extractQuotaHint(apiRaw) : null
  };
  return JSON.stringify(record);
}

function deriveFromApiRaw(
  raw: string,
  httpStatus?: number | null
): Pick<ParsedStageError, "friendly" | "kind" | "httpStatus" | "quotaHint"> {
  const status = httpStatus ?? extractHttpStatus(null, raw) ?? undefined;
  const classifyInput = status != null ? `${status} ${raw}` : raw;
  return {
    friendly: formatApiErrorMessage(classifyInput) || raw.slice(0, 600),
    kind: classifyGeminiError(classifyInput, status),
    httpStatus: status ?? null,
    quotaHint: extractQuotaHint(raw)
  };
}

export function parseStageError(stored: string | null | undefined): ParsedStageError {
  if (!stored?.trim()) {
    return { friendly: "", raw: null, kind: "unknown" };
  }
  try {
    const parsed = JSON.parse(stored) as Partial<StageErrorRecord>;
    if (parsed.v === 1 && typeof parsed.friendly === "string") {
      const raw =
        parsed.raw && looksLikeApiRaw(parsed.raw) && parsed.raw !== parsed.friendly ? parsed.raw : null;
      if (raw) {
        return { ...deriveFromApiRaw(raw, parsed.httpStatus), raw };
      }
      return {
        friendly: parsed.friendly,
        raw: null,
        kind: parsed.kind ?? "unknown",
        httpStatus: parsed.httpStatus,
        quotaHint: parsed.quotaHint
      };
    }
  } catch {
    /* legacy plain-text error */
  }
  if (looksLikeApiRaw(stored)) {
    return { ...deriveFromApiRaw(stored), raw: stored };
  }
  return {
    friendly: formatApiErrorMessage(stored),
    raw: null,
    kind: classifyGeminiError(stored),
    httpStatus: extractHttpStatus(null, stored)
  };
}

/** Friendly text for banners — handles legacy plain strings and JSON records. */
export function stageErrorFriendly(stored: string | null | undefined): string {
  const parsed = parseStageError(stored);
  return parsed.friendly || stored || "";
}

export function isBillingQuotaError(stored: string | null | undefined): boolean {
  return parseStageError(stored).kind === "billing_quota";
}

/** Strip secrets and map Gemini billing/quota errors to readable Hebrew. */
export function formatApiErrorMessage(raw: string): string {
  const sanitized = sanitizeApiErrorText(raw);

  let httpStatus: number | undefined;
  let body = sanitized;
  const statusPrefix = sanitized.match(/^(\d{3})\s+([\s\S]*)$/);
  if (statusPrefix) {
    httpStatus = Number(statusPrefix[1]);
    body = statusPrefix[2] ?? "";
  }

  const jsonMessage = extractJsonErrorMessage(body);
  const probe = `${body} ${jsonMessage ?? ""}`;
  const lower = probe.toLowerCase();
  if (lower.includes("failed to download")) {
    if (lower.includes("403") || lower.includes("expired")) {
      return "לא ניתן להוריד קובץ מ-Google Cloud Storage. ודא ש-GCS_CREDENTIALS_FILE תקין בשרת, ואז הרץ מחדש את שלב הרינדור.";
    }
    return `שגיאה בהורדת קובץ מהאחסון: ${sanitized.slice(0, 220)}`;
  }
  if (lower.includes("issue with the audio") || lower.includes("audio for your prompt")) {
    return "Veo נכשל ביצירת אודיו מקורי לפרומпт (מסנן בטיחות או בעיית עיבוד). הקול ממילא מגיע מ-TTS נפרד — ודא ש-GEMINI_VEO_AUDIO=0 בשרter והרץ rerender.";
  }
  if (
    lower.includes("real people") ||
    lower.includes("celebrity") ||
    lower.includes("likenesses") ||
    lower.includes("likeness")
  ) {
    return "Veo לא מאפשר יצירת וידאו עם שמות או דמיון לדמויות/סלבריטאים אמיתיים. הסר אזכורים כאלה מהבריף, מהסקריפט או מהתמונות, ואז הרץ מחדש את שלב הסקריפט והרינדור.";
  }
  if (
    lower.includes("content policy") ||
    lower.includes("content filtered") ||
    lower.includes("blocked by gemini") ||
    lower.includes("rai media filtered")
  ) {
    return "הווידאו נחסם על ידי מדיניות התוכן של Google (Veo). נסה לשנות את הפרומпт או את התמונות ולהריץ מחדש.";
  }
  const friendly = userFacingGeminiError(probe, httpStatus);
  if (friendly) return friendly;

  if (jsonMessage) return jsonMessage.slice(0, 600);
  return sanitized.slice(0, 600);
}

function sanitizeApiErrorText(raw: string): string {
  return raw
    .replace(/key=[^&\s"']+/gi, "key=***")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza***")
    .replace(/https:\/\/storage\.googleapis\.com\/[^\s]+/g, "[gcs-object]");
}

function extractErrorRaw(error: unknown): string {
  if (error && typeof error === "object") {
    const agentErr = error as { message?: string; metadata?: Record<string, unknown>; cause?: unknown };
    const metaRaw = agentErr.metadata?.raw;
    if (typeof metaRaw === "string" && metaRaw.trim()) {
      const status = agentErr.metadata?.status;
      if (typeof status === "number") return `${status} ${metaRaw}`;
      return metaRaw;
    }
    if (agentErr.cause) {
      const fromCause = extractErrorRaw(agentErr.cause);
      if (looksLikeApiRaw(fromCause)) return fromCause;
    }
    if (typeof agentErr.message === "string" && looksLikeApiRaw(agentErr.message)) {
      return agentErr.message;
    }
    return typeof agentErr.message === "string" ? agentErr.message : String(error);
  }
  if (error instanceof Error) {
    if (error.cause) {
      const fromCause = extractErrorRaw(error.cause);
      if (looksLikeApiRaw(fromCause)) return fromCause;
    }
    return error.message;
  }
  return String(error);
}

function extractHttpStatus(error: unknown, raw: string): number | undefined {
  if (error && typeof error === "object") {
    const status = (error as { metadata?: { status?: number } }).metadata?.status;
    if (typeof status === "number") return status;
  }
  const match = raw.match(/^(\d{3})\s+/);
  if (match) return Number(match[1]);
  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(raw.slice(jsonStart)) as { error?: { code?: number } };
      if (typeof parsed.error?.code === "number") return parsed.error.code;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function extractQuotaHint(raw: string): string | null {
  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart < 0) return null;
    const parsed = JSON.parse(raw.slice(jsonStart)) as {
      error?: { details?: Array<{ violations?: Array<{ quotaMetric?: string; quotaId?: string }> }> };
    };
    const violations = parsed.error?.details?.flatMap((d) => d.violations ?? []) ?? [];
    if (violations.length === 0) return null;
    return violations
      .map((v) => v.quotaMetric ?? v.quotaId)
      .filter(Boolean)
      .join(", ");
  } catch {
    return null;
  }
}

function extractJsonErrorMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    const jsonStart = trimmed.indexOf("{");
    if (jsonStart < 0) return null;
    return extractJsonErrorMessage(trimmed.slice(jsonStart));
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: string | { message?: string; code?: number; status?: string };
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error && typeof parsed.error === "object") {
      return parsed.error.message ?? parsed.error.status ?? null;
    }
  } catch {
    return null;
  }
  return null;
}
