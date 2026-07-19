import type { VeoDurationBucket } from "./schemas/script.js";

export function isBudgetMode(brief?: { budgetMode?: boolean } | null): boolean {
  if (brief?.budgetMode === true) return true;
  if (brief?.budgetMode === false) return false;
  return process.env.STUDIO_BUDGET_MODE === "1";
}

export function targetSceneSeconds(budget: boolean): number {
  const fromEnv = Number(process.env.TARGET_SCENE_SECONDS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return budget ? 10 : 5;
}

export function forcedVeoDurationBucket(): VeoDurationBucket | null {
  const value = process.env.GEMINI_VEO_DURATION_BUCKET;
  if (value === "4" || value === "6" || value === "8") return value;
  return null;
}

export type AssetGenerationMode = "full" | "reference_only" | "shared_reference";

export function assetGenerationMode(budget: boolean): AssetGenerationMode {
  const mode = process.env.ASSET_MODE;
  if (mode === "shared_reference" || mode === "reference_only" || mode === "full") return mode;
  return budget ? "reference_only" : "full";
}

export function veoResolution(): "720p" | "1080p" | "4k" {
  const value = process.env.GEMINI_VEO_RESOLUTION?.trim().toLowerCase();
  if (value === "1080p" || value === "4k") return value;
  return "720p";
}

export function veoGenerateAudio(): boolean {
  return process.env.GEMINI_VEO_AUDIO !== "0";
}

/** Rough USD estimate for UI (Veo per-second rates from Gemini API pricing). */
export function estimateRunCostUsd(input: {
  budgetMode: boolean;
  durationSeconds: number;
  videoModel?: string;
}): { veoSeconds: number; sceneCount: number; bucket: number; usd: number; label: string } {
  const budget = input.budgetMode;
  const target = targetSceneSeconds(budget);
  const sceneCount = Math.max(1, Math.round(input.durationSeconds / target));
  const bucket = Number(forcedVeoDurationBucket() ?? (budget ? 4 : 6));
  const veoSeconds = sceneCount * bucket;
  const model = input.videoModel ?? process.env.GEMINI_VIDEO_MODEL ?? "veo-3.1-fast-generate-preview";
  let perSecond = 0.1;
  if (model.includes("lite")) perSecond = 0.05;
  else if (model.includes("fast")) perSecond = veoGenerateAudio() ? 0.1 : 0.08;
  else if (model.includes("generate-preview") && !model.includes("fast") && !model.includes("lite")) perSecond = 0.4;
  const assetMode = assetGenerationMode(budget);
  const imageCalls = assetMode === "shared_reference" ? 1 : assetMode === "reference_only" ? sceneCount : sceneCount * 3;
  const usd = veoSeconds * perSecond + imageCalls * 0.04;
  const label = budget ? "מצב חסכון" : "רגיל";
  return { veoSeconds, sceneCount, bucket, usd, label };
}
