import type { RenderProfileId } from "./renderProfiles.js";
import { getRenderProfile } from "./renderProfiles.js";
import type { Locale } from "./localization.js";

export const STATUS_LABELS_HE: Record<string, string> = {
  PENDING: "ממתין",
  QUEUED: "בתור",
  RUNNING: "רץ",
  COMPLETED: "הושלם",
  AWAITING_APPROVAL: "ממתין לאישור",
  FAILED: "נכשל"
};

export const RUN_STATUS_LABELS_HE: Record<string, string> = {
  RUNNING: "רץ",
  AWAITING_APPROVAL: "ממתין לאישור",
  FAILED: "נכשל",
  COMPLETED: "הושלם"
};

export const STATUS_LABELS_EN: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  AWAITING_APPROVAL: "Awaiting approval",
  FAILED: "Failed"
};

export const RUN_STATUS_LABELS_EN: Record<string, string> = {
  RUNNING: "Running",
  AWAITING_APPROVAL: "Awaiting approval",
  FAILED: "Failed",
  COMPLETED: "Completed"
};

export const FRAME_TYPE_LABELS_HE = {
  referenceFrame: "תמונת עוגן",
  firstFrame: "פריים ראשון",
  lastFrame: "פריים אחרון",
  background: "רקע"
} as const;

export const FRAME_TYPE_LABELS_EN = {
  referenceFrame: "Reference frame",
  firstFrame: "First frame",
  lastFrame: "Last frame",
  background: "Background"
} as const;

export const ARTIFACT_KIND_LABELS_HE: Record<string, string> = {
  voice_clip: "קטע קול",
  music_track: "מוזיקה",
  scene_reference_frame: "תמונת עוגן",
  scene_first_frame: "פריים ראשון",
  scene_last_frame: "פריים אחרון",
  scene_image_source: "מקור תמונה",
  scene_video_source: "מקור וידאו",
  scene_rendered_clip: "קליפ סצנה",
  final_video: "סרטון סופי",
  gemini_operation: "פעולת Gemini",
  package_manifest: "מניפסט",
  instructions: "הוראות"
};

export const ARTIFACT_KIND_LABELS_EN: Record<string, string> = {
  voice_clip: "Voice clip",
  music_track: "Music",
  scene_reference_frame: "Reference frame",
  scene_first_frame: "First frame",
  scene_last_frame: "Last frame",
  scene_image_source: "Image source",
  scene_video_source: "Video source",
  scene_rendered_clip: "Rendered scene clip",
  final_video: "Final video",
  gemini_operation: "Gemini operation",
  package_manifest: "Manifest",
  instructions: "Instructions"
};

export function artifactKindLabel(kind: string, locale: Locale = "he"): string {
  return (locale === "en" ? ARTIFACT_KIND_LABELS_EN : ARTIFACT_KIND_LABELS_HE)[kind] ?? kind;
}

export function artifactKindLabelHe(kind: string): string {
  return artifactKindLabel(kind, "he");
}

export function statusLabel(status: string, locale: Locale = "he"): string {
  return (locale === "en" ? STATUS_LABELS_EN : STATUS_LABELS_HE)[status] ?? status;
}

export function statusLabelHe(status: string): string {
  return statusLabel(status, "he");
}

export function runStatusLabel(status: string, locale: Locale = "he"): string {
  return (locale === "en" ? RUN_STATUS_LABELS_EN : RUN_STATUS_LABELS_HE)[status] ?? status;
}

export function runStatusLabelHe(status: string): string {
  return runStatusLabel(status, "he");
}

export function frameTypeLabel(
  type: keyof typeof FRAME_TYPE_LABELS_HE | string,
  locale: Locale = "he"
): string {
  const labels: Record<string, string> = locale === "en" ? FRAME_TYPE_LABELS_EN : FRAME_TYPE_LABELS_HE;
  return labels[type] ?? type;
}

export function videoPromptLocalizedLabel(profile: RenderProfileId, locale: Locale = "he"): string {
  if (locale === "he") return videoPromptLabelHe(profile);
  const p = getRenderProfile(profile);
  if (p.provider === "kling" || p.provider === "fal" || p.provider === "heygen") {
    return `Motion prompt (${videoProviderShortLocalizedLabel(profile, "en")})`;
  }
  return "Video prompt";
}

export function videoPromptLabelHe(profile: RenderProfileId): string {
  const p = getRenderProfile(profile);
  if (p.provider === "kling" || p.provider === "fal" || p.provider === "heygen") {
    return `פרומפט תנועה (${videoProviderShortLabelHe(profile)})`;
  }
  return "פרומפט וידאו";
}

export function videoProviderShortLabelHe(profile: RenderProfileId): string {
  const p = getRenderProfile(profile);
  if (p.provider === "kling") return "קלינג";
  if (p.provider === "heygen") return "הייג׳ן";
  if (p.provider === "fal") {
    if (p.id === "kling-avatar-i2v") return "קלינג אווטאר";
    if (p.id === "wan-i2v") return "ואן";
    if (p.id === "hailuo-i2v") return "האילואו";
    if (p.id === "seedance-mini-i2v") return "סידנס מיני";
    if (p.id === "seedance-fast-i2v") return "סידנס פאסט";
    if (p.id === "seedance-i2v") return "סידנס";
    if (p.id === "luma-ray-i2v") return "לומה ריי";
    return "פול";
  }
  if (p.strategy === "extend") return "ויאו (הארכה)";
  return "ויאו";
}

export function videoProviderShortLocalizedLabel(profile: RenderProfileId, locale: Locale = "he"): string {
  if (locale === "he") return videoProviderShortLabelHe(profile);
  const p = getRenderProfile(profile);
  if (p.provider === "kling") return "Kling";
  if (p.provider === "heygen") return "HeyGen";
  if (p.id === "kling-avatar-i2v") return "Kling Avatar";
  if (p.id === "wan-i2v") return "Wan";
  if (p.id === "hailuo-i2v") return "Hailuo";
  if (p.id === "seedance-mini-i2v") return "Seedance Mini";
  if (p.id === "seedance-fast-i2v") return "Seedance Fast";
  if (p.id === "seedance-i2v") return "Seedance";
  if (p.id === "luma-ray-i2v") return "Luma Ray";
  if (p.provider === "fal") return "fal";
  return p.strategy === "extend" ? "Veo extend" : "Veo";
}

export const CAPABILITY_LABELS_HE: Record<string, string> = {
  Text: "טקסט",
  TTS: "דיבור",
  Image: "תמונה",
  "Music (Lyria)": "מוזיקה",
  "Veo (Gemini)": "וידאו"
};

export const CAPABILITY_LABELS_EN: Record<string, string> = {
  Text: "Text",
  TTS: "Speech",
  Image: "Image",
  "Music (Lyria)": "Music",
  "Veo (Gemini)": "Video"
};

export function capabilityLabel(capability: string, locale: Locale = "he"): string {
  return (locale === "en" ? CAPABILITY_LABELS_EN : CAPABILITY_LABELS_HE)[capability] ?? capability;
}
