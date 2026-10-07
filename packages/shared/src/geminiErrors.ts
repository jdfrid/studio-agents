import type { Locale } from "./localization.js";

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
  "prepay ai studio",
  "prepayment",
  "prepayment credits",
  "credits are depleted",
  "credits depleted",
  "depleted. please go to ai studio",
  "manage your project and billing",
  "exhausted balance",
  "user is locked"
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

export function userFacingGeminiError(
  raw: string,
  httpStatus?: number,
  locale: Locale = "he"
): string | null {
  const kind = classifyGeminiError(raw, httpStatus);
  const provider = detectExternalProvider(raw);
  if (locale === "en") {
    if (kind === "billing_quota") {
      if (provider === "heygen") {
        return "Lip-sync (HeyGen) is temporarily unavailable. Retry the stage in a few minutes, or create a video without lip-sync. Contact support if it continues — this is not a charge on your Reelmino account.";
      }
      if (provider === "fal") {
        return "Video rendering is temporarily unavailable. Retry the stage in a few minutes. Contact support if it continues — this is not a charge on your Reelmino account.";
      }
      return "Video production is paused because a rendering provider ran out of capacity. Retry the stage in a few minutes. Contact support if it continues — this is not a charge on your Reelmino account.";
    }
    if (kind === "rate_limit") {
      if (provider === "heygen")
        return "Lip-sync is busy right now. Wait a few minutes, then retry the render stage.";
      if (/\bveo\b|predictlongrunning|generatevideos|video.*generation/i.test(raw)) {
        return "Video rendering is busy right now. Wait a few minutes, then retry the stage. Completed scenes are kept.";
      }
      return "The production service is busy right now. Wait a minute or two, then retry the stage.";
    }
    if (kind === "auth") {
      return "The production service could not authorize this request. Retry later or contact support.";
    }
    return null;
  }
  switch (kind) {
    case "billing_quota":
      if (provider === "heygen") {
        return "סנכרון שפתיים (HeyGen) אינו זמין כרגע. נסו שוב בעוד כמה דקות, או צרו סרטון בלי סנכרון שפתיים. אם זה נמשך פנו לתמיכה — אין צורך לטפל בחשבון חיוב חיצוני.";
      }
      if (provider === "fal") {
        return "הפקת הווידאו נעצרה זמנית אצל ספק הרינדור. נסו שוב בעוד כמה דקות. אם זה נמשך פנו לתמיכה — זה לא חיוב בחשבון Reelmino.";
      }
      return "הפקת הווידאו נעצרה כי ספק הרינדור אינו זמין כרגע. נסו שוב בעוד כמה דקות. אם זה נמשך פנו לתמיכה — אין צורך לטפל בחשבון חיוב של ספק חיצוני.";
    case "rate_limit":
      if (provider === "heygen") {
        return "סנכרון שפתיים עמוס כרגע. המתינו כמה דקות והפעילו מחדש את שלב הרינדור.";
      }
      if (/\bveo\b|predictlongrunning|generatevideos|video.*generation/i.test(raw)) {
        return "הרינדור עמוס כרגע. המתינו כמה דקות והפעילו מחדש את השלב. סצנות שכבר הושלמו נשמרות.";
      }
      return "שירות ההפקה עמוס כרגע. המתינו דקה–שתיים והפעילו מחדש את השלב.";
    case "auth":
      return "שירות ההפקה לא הצליח לאשר את הבקשה. נסו שוב מאוחר יותר או פנו לתמיכה.";
    default:
      return null;
  }
}

function detectExternalProvider(raw: string): "heygen" | "fal" | "gemini" | null {
  const lower = raw.toLowerCase();
  if (lower.includes("heygen") || lower.includes("api.heygen.com")) return "heygen";
  // HeyGen-specific error code (Google does not use this exact code string).
  if (lower.includes("insufficient_credit") || lower.includes("purchase credit packs")) return "heygen";
  if (lower.includes("fal.ai") || lower.includes("fal.media") || lower.includes("fal-ai")) return "fal";
  if (
    lower.includes("generativelanguage.googleapis.com") ||
    lower.includes("gemini") ||
    lower.includes("veo")
  ) {
    return "gemini";
  }
  return null;
}

function looksLikeApiRaw(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.startsWith("{") || t.includes('{"error"') || t.includes('"error":')) return true;
  if (/^\d{3}\s/.test(t)) return true;
  if (/generativelanguage\.googleapis\.com/i.test(t)) return true;
  if (/api\.heygen\.com/i.test(t)) return true;
  if (/fal\.ai|fal\.media/i.test(t)) return true;
  if (/RESOURCE_EXHAUSTED|PERMISSION_DENIED|INVALID_ARGUMENT|insufficient_credit/i.test(t)) return true;
  if (/ffmpeg (exited|probe)/i.test(t)) return true;
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
  httpStatus?: number | null,
  locale: Locale = "he"
): Pick<ParsedStageError, "friendly" | "kind" | "httpStatus" | "quotaHint"> {
  const status = httpStatus ?? extractHttpStatus(null, raw) ?? undefined;
  const classifyInput = status != null ? `${status} ${raw}` : raw;
  return {
    friendly: formatApiErrorMessage(classifyInput, locale) || raw.slice(0, 600),
    kind: classifyGeminiError(classifyInput, status),
    httpStatus: status ?? null,
    quotaHint: extractQuotaHint(raw)
  };
}

export function parseStageError(stored: string | null | undefined, locale: Locale = "he"): ParsedStageError {
  if (!stored?.trim()) {
    return { friendly: "", raw: null, kind: "unknown" };
  }
  try {
    const parsed = JSON.parse(stored) as Partial<StageErrorRecord>;
    if (parsed.v === 1 && typeof parsed.friendly === "string") {
      const raw =
        parsed.raw && looksLikeApiRaw(parsed.raw) && parsed.raw !== parsed.friendly ? parsed.raw : null;
      if (raw) {
        return { ...deriveFromApiRaw(raw, parsed.httpStatus, locale), raw };
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
    return { ...deriveFromApiRaw(stored, undefined, locale), raw: stored };
  }
  return {
    friendly: formatApiErrorMessage(stored, locale),
    raw: null,
    kind: classifyGeminiError(stored),
    httpStatus: extractHttpStatus(null, stored)
  };
}

/** Friendly text for banners — handles legacy plain strings and JSON records. */
export function stageErrorFriendly(stored: string | null | undefined, locale: Locale = "he"): string {
  const parsed = parseStageError(stored, locale);
  return parsed.friendly || stored || "";
}

export function isBillingQuotaError(stored: string | null | undefined): boolean {
  return parseStageError(stored).kind === "billing_quota";
}

/** Strip secrets and map Gemini billing/quota errors to readable Hebrew. */
export function formatApiErrorMessage(raw: string, locale: Locale = "he"): string {
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
  if (
    lower.includes("ffmpeg exited null") ||
    /ffmpeg exited signal sigkill/i.test(lower)
  ) {
    return locale === "en"
      ? "Video assembly ran out of memory on the server while encoding clips. Retry the render stage."
      : "הרכבת הווידאו נקטעה כי נגמר הזיכרון בשרת בזמן קידוד הקליפים. הרץ מחדש את שלב הרינדור.";
  }
  if (lower.includes("ffmpeg exited") || lower.includes("ffmpeg probe exited")) {
    return locale === "en"
      ? "Video assembly failed while encoding clips. Retry the render stage."
      : "הרכבת הווידאו נכשלה בקידוד הקליפים. הרץ מחדש את שלב הרינדור.";
  }
  if (lower.includes("image_too_small") || lower.includes("minimum dimensions are 300")) {
    return locale === "en"
      ? "A reference image is smaller than 300×300 pixels and cannot be animated. Upload a larger photo or retry render — small stills are now upscaled automatically."
      : "תמונת הייחוס קטנה מ־300×300 פיקסלים ולא ניתן להנפיש אותה. העלו תמונה גדולה יותר או הרץ מחדש את הרינדור — תמונות קטנות מוגדלות עכשיו אוטומטית.";
  }
  if (lower.includes("input token count exceeds") || lower.includes("maximum number of tokens allowed")) {
    return locale === "en"
      ? "The production request is too large. Retry the brief stage, and contact support if it continues."
      : "בקשת ההפקה גדולה מדי. הפעילו מחדש את שלב הביריף, ואם זה נמשך פנו לתמיכה.";
  }
  if (
    (lower.includes("wan") ||
      lower.includes("hailuo") ||
      lower.includes("kling") ||
      lower.includes("heygen")) &&
    (lower.includes("not found") || lower.includes("predictlongrunning") || lower.includes("not supported"))
  ) {
    return locale === "en"
      ? "Video production is misconfigured on the service. Retry later or contact support — this is not something to fix in your Reelmino account."
      : "הפקת הווידאו לא הוגדרה כראוי בשרת. נסו שוב מאוחר יותר או פנו לתמיכה — אין צורך לשנות הגדרות בחשבון שלכם.";
  }
  if (lower.includes("no audio inline data") || lower.includes("finishreason=other")) {
    if (lower.includes("yiddish") || lower.includes("yi")) {
      return locale === "en"
        ? "Yiddish audio could not be generated. Try shorter dubbing lines or Hebrew with a Yiddish accent, then retry the audio stage."
        : "לא הצלחנו להפיק אודיו ליידיש. נסו משפטי דיבוב קצרים יותר, או בחרו עברית עם מבטא יידיש — ואז הפעילו מחדש את שלב האודיו.";
    }
    return locale === "en"
      ? "Voice audio could not be generated, usually because the text, language, or voice is unsupported. Change the voice or shorten the narration, then retry the audio stage."
      : "לא הצלחנו להפיק את קובץ הקול. לרוב בגלל טקסט, שפה או קול שאינם נתמכים. שנו סגנון קול או קצרו את הדיבוב, והפעילו מחדש את שלב האודיו.";
  }
  if (lower.includes("failed to download")) {
    return locale === "en"
      ? "A production file could not be loaded from storage. Retry the render stage, and contact support if it continues."
      : "לא ניתן לטעון קובץ הפקה מהאחסון. הרץ מחדש את שלב הרינדור, ואם זה נמשך פנו לתמיכה.";
  }
  if (lower.includes("issue with the audio") || lower.includes("audio for your prompt")) {
    return locale === "en"
      ? "Video rendering failed because the prompt requested speech or music. Retry the render stage. Contact support if it continues."
      : "הרינדור נכשל כי הפרומפט ביקש דיבור או מוזיקה. הפעילו מחדש את שלב הרינדור, ואם זה נמשך פנו לתמיכה.";
  }
  if (
    lower.includes("real people") ||
    lower.includes("celebrity") ||
    lower.includes("likenesses") ||
    lower.includes("likeness")
  ) {
    return locale === "en"
      ? "Veo does not allow videos that name or resemble real public figures or celebrities. Remove those references, then rerun the script and render stages."
      : "Veo לא מאפשר יצירת וידאו עם שמות או דמיון לדמויות/סלבריטאים אמיתיים. הסר אזכורים כאלה מהבריף, מהסקריפט או מהתמונות, ואז הרץ מחדש את שלב הסקריפט והרינדור.";
  }
  if (
    lower.includes("content policy") ||
    lower.includes("content filtered") ||
    lower.includes("blocked by gemini") ||
    lower.includes("rai media filtered")
  ) {
    return locale === "en"
      ? "Google Veo blocked the video under its content policy. Change the prompt or images, then retry."
      : "הווידאו נחסם על ידי מדיניות התוכן של Google (Veo). נסה לשנות את הפרומпט או את התמונות ולהריץ מחדש.";
  }
  const friendly = userFacingGeminiError(probe, httpStatus, locale);
  if (friendly) return friendly;
  return locale === "en"
    ? "Production hit a temporary problem. Retry the stage, and contact support if it continues."
    : "ההפקה נתקלה בבעיה זמנית. הפעילו מחדש את השלב, ואם זה נמשך פנו לתמיכה.";
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
