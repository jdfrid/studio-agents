import {
  listRenderProfiles,
  profileVideoPerSecondUsd,
  resolveRenderProfile,
  type RenderProfile
} from "./renderProfiles.js";

/** A customer video, counted the way the price list counts it. */
export const STANDARD_VIDEO_SECONDS = 30;
/** Rough spoken length of a 30-second narration, for character quotas only. */
export const NARRATION_CHARS_PER_STANDARD_VIDEO = 450;
/** Mail the operator once a metered service can cover this many videos or fewer. */
export const LOW_VIDEO_WARNING = 3;

export type CapacityKind = "videos" | "narration" | "unknown" | "not_metered";

export function monitorProviderForProfile(profile: RenderProfile): string {
  if (profile.provider === "heygen") return "heygen";
  if (profile.provider === "runway") return "runway";
  if (profile.provider === "kling" || profile.provider === "fal") return "fal";
  return "gemini";
}

/** USD per video-second to turn this provider's balance into a video count. */
export function usdPerSecondForProvider(provider: string): { usdPerSecond: number | null; activeModel: boolean } {
  const active = resolveRenderProfile();
  if (monitorProviderForProfile(active) === provider) {
    return { usdPerSecond: profileVideoPerSecondUsd(active), activeModel: true };
  }
  const rates = listRenderProfiles()
    .filter((profile) => monitorProviderForProfile(profile) === provider)
    .map((profile) => profileVideoPerSecondUsd(profile))
    .filter((rate) => rate > 0);
  if (!rates.length) return { usdPerSecond: null, activeModel: false };
  return { usdPerSecond: Math.min(...rates), activeModel: false };
}

export function meterVideos(input: {
  balance: number | null;
  unit: string | null;
  usdPerSecond: number | null;
}): {
  kind: CapacityKind;
  videosRemaining: number | null;
  costPerVideoUsd: number | null;
  videoSeconds: number;
} {
  const unit = (input.unit ?? "").trim().toLowerCase();
  const videoSeconds = STANDARD_VIDEO_SECONDS;
  if (unit === "characters") {
    if (input.balance === null) {
      return { kind: "unknown", videosRemaining: null, costPerVideoUsd: null, videoSeconds };
    }
    return {
      kind: "narration",
      videosRemaining: Math.max(0, Math.floor(input.balance / NARRATION_CHARS_PER_STANDARD_VIDEO)),
      costPerVideoUsd: null,
      videoSeconds
    };
  }
  const usd = unit === "usd" || unit.startsWith("usd");
  if (!usd || input.balance === null || !(input.usdPerSecond && input.usdPerSecond > 0)) {
    return {
      kind: input.balance === null || usd ? "unknown" : "not_metered",
      videosRemaining: null,
      costPerVideoUsd: null,
      videoSeconds
    };
  }
  const costPerVideoUsd = Math.round(input.usdPerSecond * videoSeconds * 100) / 100;
  if (!(costPerVideoUsd > 0)) {
    return { kind: "unknown", videosRemaining: null, costPerVideoUsd: null, videoSeconds };
  }
  return {
    kind: "videos",
    videosRemaining: Math.max(0, Math.floor(input.balance / costPerVideoUsd)),
    costPerVideoUsd,
    videoSeconds
  };
}

export function capacityStopsProduction(input: {
  kind: CapacityKind;
  videosRemaining: number | null;
  billingFailure: boolean;
  requiredForActiveVideo: boolean;
}): boolean {
  if (input.billingFailure && (input.requiredForActiveVideo || input.kind === "narration")) return true;
  if (input.videosRemaining === null) return false;
  if (input.kind === "narration") return input.videosRemaining <= LOW_VIDEO_WARNING;
  if (!input.requiredForActiveVideo) return false;
  return input.videosRemaining <= LOW_VIDEO_WARNING;
}

export type ProductionBlockReason = "not_configured" | "no_funds" | "auth" | "billing_failure";

/** What the customer sees, and what the operator is mailed, when a new video is refused. */
export function productionBlockedNotice(input: {
  modelLabel: string;
  providerName: string;
  reason: ProductionBlockReason;
  adminUrl?: string | null;
}): { subject: string; text: string; customerHe: string } {
  const why =
    input.reason === "not_configured"
      ? `${input.providerName} לא מחובר, ולכן אי אפשר להפיק סרטון במודל הזה.`
      : input.reason === "no_funds"
        ? `ל-${input.providerName} אין יתרה שמספיקה לסרטון נוסף.`
        : input.reason === "auth"
          ? `החיבור ל-${input.providerName} נדחה.`
          : `החיוב של ${input.providerName} נכשל.`;
  const adminUrl = input.adminUrl?.trim() || "https://admin.reelmino.com";
  return {
    subject: `אי אפשר להפיק סרטון: ${input.modelLabel}`,
    text: [
      "לקוח ניסה ליצור סרטון ונעצר.",
      `המודל הפעיל: ${input.modelLabel}.`,
      why,
      "זו לא תקלת עומס. המתנה של כמה דקות לא תפתור את זה.",
      `הגדרות המודל: ${adminUrl}`
    ].join("\n"),
    customerHe: `אי אפשר להפיק סרטון במודל הנוכחי (${input.modelLabel}). ${why} זו לא תקלת עומס, ולא חויבתם.`
  };
}

export function capacityAlertCopy(input: {
  providerName: string;
  videosRemaining: number | null;
  videoSeconds: number;
  costPerVideoUsd: number | null;
  balanceLabel: string;
  billingUrl: string | null;
  billingFailure: boolean;
  adminUrl?: string | null;
}): { subject: string; text: string } {
  const stopped = input.billingFailure || input.videosRemaining === 0;
  const subject = stopped
    ? `אי אפשר להפיק סרטון: ${input.providerName}`
    : `נותרו ${input.videosRemaining ?? 0} סרטונים: ${input.providerName}`;
  const lines = [
    stopped
      ? `${input.providerName} לא יכול לבצע עוד הפקה. לקוח שינסה ליצור סרטון ייעצר.`
      : `${input.providerName} יכול לכסות עוד ${input.videosRemaining} סרטונים בלבד.`,
    `החישוב הוא לסרטון של ${input.videoSeconds} שניות.`,
    input.costPerVideoUsd !== null ? `עלות הווידאו לסרטון כזה: $${input.costPerVideoUsd.toFixed(2)}.` : "",
    input.balanceLabel ? `יתרה שנקראה: ${input.balanceLabel}.` : "",
    input.billingUrl ? `הוספת תשלום: ${input.billingUrl}` : "אין קישור ישיר להוספת תשלום לשירות הזה.",
    input.adminUrl ? `מסך השירותים: ${input.adminUrl}` : ""
  ].filter(Boolean);
  return { subject, text: lines.join("\n") };
}
