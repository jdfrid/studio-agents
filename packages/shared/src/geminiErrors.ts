export type GeminiErrorKind = "billing_quota" | "rate_limit" | "auth" | "unknown";

const BILLING_QUOTA_PATTERNS = [
  "resource_exhausted",
  "quota exceeded",
  "exceeded your current quota",
  "insufficient",
  "billing",
  "payment required",
  "credit",
  "balance",
  "spending limit",
  "budget",
  "out of funds",
  "account disabled",
  "enable billing"
];

const RATE_LIMIT_PATTERNS = ["rate limit", "too many requests", "retry after", "429"];

export function classifyGeminiError(raw: string, httpStatus?: number): GeminiErrorKind {
  const lower = raw.toLowerCase();
  if (httpStatus === 402) return "billing_quota";
  if (httpStatus === 429) {
    return BILLING_QUOTA_PATTERNS.some((p) => lower.includes(p)) ? "billing_quota" : "rate_limit";
  }
  if (BILLING_QUOTA_PATTERNS.some((p) => lower.includes(p))) return "billing_quota";
  if (RATE_LIMIT_PATTERNS.some((p) => lower.includes(p))) return "rate_limit";
  if (httpStatus === 401 || httpStatus === 403 || lower.includes("api key not valid")) return "auth";
  return "unknown";
}

export function userFacingGeminiError(raw: string, httpStatus?: number): string | null {
  const kind = classifyGeminiError(raw, httpStatus);
  switch (kind) {
    case "billing_quota":
      return [
        "הגעת למגבלת התקציב / יתרה ב-Google Cloud.",
        "אין מספיק כסף בחשבון להמשך ייצור (Veo, תמונות, TTS).",
        "הוסף תקציב או המתן לחידוש מכסה, ואז הרץ מחדש את השלב.",
        "ניהול תקציב: https://console.cloud.google.com/billing"
      ].join(" ");
    case "rate_limit":
      return "יותר מדי בקשות ל-Gemini בזמן קצר. המתן כמה דקות ונסה שוב.";
    case "auth":
      return "בעיית הרשאה ל-Gemini API — בדוק שה-API key תקין וש-billing מחובר לפרויקט.";
    default:
      return null;
  }
}

/** Strip secrets and map Gemini billing/quota errors to readable Hebrew. */
export function formatApiErrorMessage(raw: string): string {
  const sanitized = raw
    .replace(/key=[^&\s"']+/gi, "key=***")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza***");

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
