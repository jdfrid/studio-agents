import type { RenderProfileId } from "./renderProfiles.js";
import { getRenderProfile, videoProviderShortLabel } from "./renderProfiles.js";

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

export const FRAME_TYPE_LABELS_HE = {
  referenceFrame: "תמונת עוגן",
  firstFrame: "פריים ראשון",
  lastFrame: "פריים אחרון",
  background: "רקע"
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

export function artifactKindLabelHe(kind: string): string {
  return ARTIFACT_KIND_LABELS_HE[kind] ?? kind;
}

export function statusLabelHe(status: string): string {
  return STATUS_LABELS_HE[status] ?? status;
}

export function runStatusLabelHe(status: string): string {
  return RUN_STATUS_LABELS_HE[status] ?? status;
}

export function videoPromptLabelHe(profile: RenderProfileId): string {
  const p = getRenderProfile(profile);
  if (p.provider === "kling" || p.provider === "fal") {
    return `פרומפט תנועה (${videoProviderShortLabel(p)})`;
  }
  return "פרומפט וידאו (Veo)";
}

export function videoProviderShortLabelHe(profile: RenderProfileId): string {
  const p = getRenderProfile(profile);
  if (p.provider === "kling" || p.provider === "fal") return videoProviderShortLabel(p);
  if (p.strategy === "extend") return "Veo (הארכה)";
  return "Veo";
}

export const CAPABILITY_LABELS_HE: Record<string, string> = {
  Text: "טקסט",
  TTS: "דיבור",
  Image: "תמונה",
  "Music (Lyria)": "מוזיקה (Lyria)",
  "Veo (Gemini)": "Veo (Gemini)"
};
