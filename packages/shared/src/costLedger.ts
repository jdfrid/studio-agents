import type { StageName } from "./enums.js";
import { DEFAULT_USD_TO_ILS, veoGenerateAudio, veoPerSecondUsd } from "./budget.js";

export type CostActivityType =
  | "veo_video"
  | "gemini_tts"
  | "gemini_image"
  | "gemini_text"
  | "gemini_music"
  | "gcs_upload"
  | "gcs_storage";

export type CostChargedStatus = "yes" | "no" | "unknown";

export type CostBilledUnit =
  | "veo_seconds"
  | "image_call"
  | "text_call"
  | "tts_call"
  | "music_seconds"
  | "bytes";

export interface CostEventInput {
  tenantId: string;
  runId: string;
  stageExecutionId?: string | null;
  attempt?: number;
  stage: StageName;
  activityType: CostActivityType;
  sceneId?: string | null;
  model?: string | null;
  startedAt?: Date;
  durationMs?: number | null;
  billedUnits: number;
  unit: CostBilledUnit;
  charged?: CostChargedStatus;
  metadata?: Record<string, unknown>;
}

export interface CostEventView extends CostEventInput {
  id: string;
  costUsd: number;
  costNis: number;
  charged: CostChargedStatus;
  startedAt: Date;
}

export interface CostEventSummary {
  totalNis: number;
  totalUsd: number;
  byActivity: Record<CostActivityType, { nis: number; usd: number; count: number }>;
  byStage: Partial<Record<StageName, { nis: number; usd: number; count: number }>>;
  byAttempt: Record<number, { nis: number; usd: number; count: number }>;
}

const GEMINI_IMAGE_USD = 0.04;
const GEMINI_TEXT_CALL_USD = 0.002;
const GEMINI_TTS_CALL_USD = 0.015;
const GEMINI_MUSIC_PER_SECOND_USD = 0.01;
/** GCS Standard storage ~$0.02/GB/month prorated to one day for ledger line. */
const GCS_STORAGE_USD_PER_GB_DAY = 0.02 / 30;
const GCS_UPLOAD_USD_PER_GB = 0.0;

export function usdToNis(usd: number, rate = DEFAULT_USD_TO_ILS): number {
  return usd * rate;
}

export function priceVeoScene(
  model: string,
  durationSeconds: number,
  generateAudio = veoGenerateAudio()
): { usd: number; billedUnits: number; unit: CostBilledUnit } {
  const perSecond = veoPerSecondUsd(model, generateAudio);
  return {
    usd: durationSeconds * perSecond,
    billedUnits: durationSeconds,
    unit: "veo_seconds"
  };
}

export function priceGeminiImage(): { usd: number; billedUnits: number; unit: CostBilledUnit } {
  return { usd: GEMINI_IMAGE_USD, billedUnits: 1, unit: "image_call" };
}

export function priceGeminiText(_charCount = 0): { usd: number; billedUnits: number; unit: CostBilledUnit } {
  return { usd: GEMINI_TEXT_CALL_USD, billedUnits: 1, unit: "text_call" };
}

export function priceGeminiTts(_charCount = 0): { usd: number; billedUnits: number; unit: CostBilledUnit } {
  return { usd: GEMINI_TTS_CALL_USD, billedUnits: 1, unit: "tts_call" };
}

export function priceGeminiMusic(durationSeconds: number): { usd: number; billedUnits: number; unit: CostBilledUnit } {
  const seconds = Math.max(1, durationSeconds);
  return { usd: seconds * GEMINI_MUSIC_PER_SECOND_USD, billedUnits: seconds, unit: "music_seconds" };
}

export function priceGcsUpload(bytes: number): { usd: number; billedUnits: number; unit: CostBilledUnit } {
  const gb = bytes / (1024 * 1024 * 1024);
  return { usd: gb * GCS_UPLOAD_USD_PER_GB, billedUnits: bytes, unit: "bytes" };
}

export function priceGcsStorageDaily(bytes: number): { usd: number; billedUnits: number; unit: CostBilledUnit } {
  const gb = bytes / (1024 * 1024 * 1024);
  return { usd: gb * GCS_STORAGE_USD_PER_GB_DAY, billedUnits: bytes, unit: "bytes" };
}

export function computeCostAmounts(
  activityType: CostActivityType,
  billedUnits: number,
  options: {
    model?: string;
    generateAudio?: boolean;
    charged?: CostChargedStatus;
    usdRate?: number;
  } = {}
): { costUsd: number; costNis: number; charged: CostChargedStatus } {
  const charged = options.charged ?? "yes";
  if (charged === "no") {
    return { costUsd: 0, costNis: 0, charged };
  }

  let usd = 0;
  switch (activityType) {
    case "veo_video":
      usd = priceVeoScene(options.model ?? "veo-3.1-fast-generate-preview", billedUnits, options.generateAudio).usd;
      break;
    case "gemini_image":
      usd = priceGeminiImage().usd;
      break;
    case "gemini_text":
      usd = priceGeminiText(billedUnits).usd;
      break;
    case "gemini_tts":
      usd = priceGeminiTts(billedUnits).usd;
      break;
    case "gemini_music":
      usd = priceGeminiMusic(billedUnits).usd;
      break;
    case "gcs_upload":
      usd = priceGcsUpload(billedUnits).usd;
      break;
    case "gcs_storage":
      usd = priceGcsStorageDaily(billedUnits).usd;
      break;
  }

  const rate = options.usdRate ?? DEFAULT_USD_TO_ILS;
  return { costUsd: usd, costNis: usdToNis(usd, rate), charged };
}

export function activityTypeLabel(type: CostActivityType): string {
  switch (type) {
    case "veo_video":
      return "Veo וידאו";
    case "gemini_tts":
      return "Gemini TTS";
    case "gemini_image":
      return "Gemini תמונה";
    case "gemini_text":
      return "Gemini text";
    case "gemini_music":
      return "Gemini מוזיקה";
    case "gcs_upload":
      return "GCS העלאה";
    case "gcs_storage":
      return "GCS אחסון (יומי)";
  }
}

export function summarizeRunCosts(events: CostEventView[], usdRate = DEFAULT_USD_TO_ILS): CostEventSummary {
  const byActivity = {} as CostEventSummary["byActivity"];
  const byStage: CostEventSummary["byStage"] = {};
  const byAttempt: CostEventSummary["byAttempt"] = {};
  let totalNis = 0;
  let totalUsd = 0;

  for (const event of events) {
    totalNis += event.costNis;
    totalUsd += event.costUsd;

    const act = byActivity[event.activityType] ?? { nis: 0, usd: 0, count: 0 };
    act.nis += event.costNis;
    act.usd += event.costUsd;
    act.count += 1;
    byActivity[event.activityType] = act;

    const st = byStage[event.stage] ?? { nis: 0, usd: 0, count: 0 };
    st.nis += event.costNis;
    st.usd += event.costUsd;
    st.count += 1;
    byStage[event.stage] = st;

    const att = event.attempt ?? 1;
    const at = byAttempt[att] ?? { nis: 0, usd: 0, count: 0 };
    at.nis += event.costNis;
    at.usd += event.costUsd;
    at.count += 1;
    byAttempt[att] = at;
  }

  void usdRate;
  return { totalNis, totalUsd, byActivity, byStage, byAttempt };
}

export function veoNotChargedFromError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("not been charged") || message.toLowerCase().includes("not charged");
}
