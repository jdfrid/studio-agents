import type { VeoDurationBucket } from "./schemas/script.js";

export const DEFAULT_USD_TO_ILS = 3.6;
/** Runs above this NIS show a blocking confirmation. */
export const EXPENSIVE_RUN_NIS = 10;

export function isBudgetMode(brief?: { budgetMode?: boolean } | null): boolean {
  if (brief?.budgetMode === true) return true;
  if (brief?.budgetMode === false) return false;
  return process.env.STUDIO_BUDGET_MODE === "1";
}

export function targetSceneSeconds(budget: boolean, override?: number): number {
  if (override != null && Number.isFinite(override) && override > 0) return override;
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

export function assetGenerationMode(budget: boolean, override?: AssetGenerationMode): AssetGenerationMode {
  if (override === "shared_reference" || override === "reference_only" || override === "full") return override;
  const mode = process.env.ASSET_MODE;
  if (mode === "shared_reference" || mode === "reference_only" || mode === "full") return mode;
  return budget ? "reference_only" : "full";
}

export function veoResolution(): "720p" | "1080p" | "4k" {
  const value = process.env.GEMINI_VEO_RESOLUTION?.trim().toLowerCase();
  if (value === "1080p" || value === "4k") return value;
  return "720p";
}

export function veoGenerateAudio(override?: boolean): boolean {
  if (override != null) return override;
  return process.env.GEMINI_VEO_AUDIO !== "0";
}

export type VeoModelTier = "lite" | "fast" | "standard" | "unknown";

export function veoModelTier(model: string): VeoModelTier {
  const m = model.toLowerCase();
  if (m.includes("lite")) return "lite";
  if (m.includes("fast")) return "fast";
  if (m.includes("generate-preview")) return "standard";
  return "unknown";
}

export function veoModelLabel(tier: VeoModelTier): string {
  switch (tier) {
    case "lite":
      return "Veo Lite (זול)";
    case "fast":
      return "Veo Fast";
    case "standard":
      return "Veo Standard (יקר!)";
    default:
      return "Veo";
  }
}

export function veoPerSecondUsd(model: string, generateAudio = true): number {
  const tier = veoModelTier(model);
  if (tier === "lite") return 0.05;
  if (tier === "fast") return generateAudio ? 0.1 : 0.08;
  if (tier === "standard") return 0.4;
  return 0.1;
}

export type ProductionCostConfig = {
  videoModel: string;
  usdToIls: number;
  targetSceneSeconds?: number;
  forcedVeoBucket?: VeoDurationBucket | null;
  assetMode?: AssetGenerationMode;
  veoGenerateAudio: boolean;
};

export function buildProductionCostConfig(videoModel: string): ProductionCostConfig {
  const target = Number(process.env.TARGET_SCENE_SECONDS);
  const asset = process.env.ASSET_MODE;
  return {
    videoModel,
    usdToIls: Number(process.env.USD_TO_ILS) || DEFAULT_USD_TO_ILS,
    targetSceneSeconds: Number.isFinite(target) && target > 0 ? target : undefined,
    forcedVeoBucket: forcedVeoDurationBucket(),
    assetMode:
      asset === "shared_reference" || asset === "reference_only" || asset === "full" ? asset : undefined,
    veoGenerateAudio: veoGenerateAudio()
  };
}

export type RunCostEstimate = {
  usd: number;
  nis: number;
  veoSeconds: number;
  sceneCount: number;
  bucket: number;
  label: string;
  videoModel: string;
  veoTier: VeoModelTier;
  veoTierLabel: string;
  veoUsd: number;
  imageUsd: number;
  imageCalls: number;
  perSecondUsd: number;
  isExpensive: boolean;
  warning?: string;
};

export function estimateRunCost(
  input: {
    budgetMode: boolean;
    durationSeconds: number;
    scenes?: Array<{ durationBucket?: string | number }> | null;
  },
  config?: Partial<ProductionCostConfig>
): RunCostEstimate {
  const budget = input.budgetMode;
  const videoModel = config?.videoModel ?? process.env.GEMINI_VIDEO_MODEL ?? "veo-3.1-fast-generate-preview";
  const usdToIls = config?.usdToIls ?? DEFAULT_USD_TO_ILS;
  const generateAudio = config?.veoGenerateAudio ?? veoGenerateAudio();
  const perSecond = veoPerSecondUsd(videoModel, generateAudio);
  const tier = veoModelTier(videoModel);

  let sceneCount: number;
  let veoSeconds: number;
  let bucket: number;

  if (input.scenes?.length) {
    sceneCount = input.scenes.length;
    veoSeconds = input.scenes.reduce((sum, scene) => {
      const b = scene.durationBucket;
      const n = b === "4" || b === "6" || b === "8" ? Number(b) : b === 4 || b === 6 || b === 8 ? b : 6;
      return sum + n;
    }, 0);
    bucket = sceneCount > 0 ? Math.round(veoSeconds / sceneCount) : 6;
  } else {
    const target = targetSceneSeconds(budget, config?.targetSceneSeconds);
    sceneCount = Math.max(1, Math.round(input.durationSeconds / target));
    bucket = Number(config?.forcedVeoBucket ?? forcedVeoDurationBucket() ?? (budget ? 4 : 6));
    veoSeconds = sceneCount * bucket;
  }

  const mode = assetGenerationMode(budget, config?.assetMode);
  const imageCalls = mode === "shared_reference" ? 1 : mode === "reference_only" ? sceneCount : sceneCount * 3;
  const veoUsd = veoSeconds * perSecond;
  const imageUsd = imageCalls * 0.04;
  const usd = veoUsd + imageUsd;
  const nis = usd * usdToIls;
  const isExpensive = tier === "standard" || nis >= EXPENSIVE_RUN_NIS;

  let warning: string | undefined;
  if (tier === "standard") {
    warning = `השרת מוגדר ל-${veoModelLabel(tier)} (~₪${Math.round(perSecond * usdToIls * 10) / 10}/שנייה). סרטון 30 שניות עלול לעלות ~₪50.`;
  } else if (!budget && nis >= EXPENSIVE_RUN_NIS) {
    warning = "מצב רגיל — יותר סצנות ויותר תמונות. הפעל מצב חסכון להוזלה.";
  } else if (budget && nis >= EXPENSIVE_RUN_NIS) {
    warning = "עלות גבוהה מהצפוי — בדוק את מודל Veo בשרת.";
  }

  return {
    usd,
    nis,
    veoSeconds,
    sceneCount,
    bucket,
    label: budget ? "מצב חסכון" : "מצב רגיל",
    videoModel,
    veoTier: tier,
    veoTierLabel: veoModelLabel(tier),
    veoUsd,
    imageUsd,
    imageCalls,
    perSecondUsd: perSecond,
    isExpensive,
    warning
  };
}

/** @deprecated Use estimateRunCost */
export function estimateRunCostUsd(input: {
  budgetMode: boolean;
  durationSeconds: number;
  videoModel?: string;
}): { veoSeconds: number; sceneCount: number; bucket: number; usd: number; label: string } {
  const est = estimateRunCost(input, input.videoModel ? { videoModel: input.videoModel, veoGenerateAudio: veoGenerateAudio(), usdToIls: DEFAULT_USD_TO_ILS } : undefined);
  return { veoSeconds: est.veoSeconds, sceneCount: est.sceneCount, bucket: est.bucket, usd: est.usd, label: est.label };
}

export function formatCostNis(nis: number): string {
  if (nis < 1) return `~₪${nis.toFixed(1)}`;
  return `~₪${Math.round(nis)}`;
}
