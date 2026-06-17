import { z } from "zod";

export const STAGE_NAMES = ["brief", "script", "audio", "asset", "package", "render", "series"] as const;
export const StageNameSchema = z.enum(STAGE_NAMES);
export type StageName = z.infer<typeof StageNameSchema>;

export const STAGE_ORDER: StageName[] = ["brief", "script", "audio", "asset", "package", "render", "series"];

export function nextStage(stage: StageName): StageName | null {
  const i = STAGE_ORDER.indexOf(stage);
  if (i < 0 || i >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1] ?? null;
}

export const StageStatusSchema = z.enum([
  "PENDING",
  "QUEUED",
  "RUNNING",
  "AWAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "SKIPPED"
]);
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const RunStatusSchema = z.enum([
  "DRAFT",
  "RUNNING",
  "AWAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELLED"
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const AspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const ProviderTypeSchema = z.enum([
  "GEMINI",
  "LLM",
  "TTS",
  "MUSIC",
  "MEDIA_SEARCH",
  "VIDEO",
  "STORAGE"
]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;
