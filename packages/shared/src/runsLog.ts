import type { CostActivityType } from "./costLedger.js";
import type { StageName } from "./enums.js";

export const COST_ACTIVITY_ORDER: CostActivityType[] = [
  "veo_video",
  "gemini_image",
  "gemini_tts",
  "gemini_text",
  "gemini_music",
  "gcs_upload",
  "gcs_storage"
];

export type RunLogStageCell = {
  stage: StageName;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  costNis: number;
  costUsd: number;
  eventCount: number;
};

export type RunLogEntry = {
  id: string;
  title: string;
  status: string;
  renderProfile: string | null;
  createdAt: string;
  updatedAt: string;
  totalDurationMs: number | null;
  totalNis: number;
  totalUsd: number;
  stages: RunLogStageCell[];
  costsByActivity: Partial<Record<CostActivityType, { nis: number; usd: number; count: number }>>;
};

export type RunLogMatrixResponse = {
  runs: RunLogEntry[];
  totals: { nis: number; usd: number; runCount: number };
};

export function stageDurationMs(startedAt: Date | string | null, completedAt: Date | string | null): number | null {
  if (!startedAt || !completedAt) return null;
  const start = typeof startedAt === "string" ? Date.parse(startedAt) : startedAt.getTime();
  const end = typeof completedAt === "string" ? Date.parse(completedAt) : completedAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

/**
 * Sum of stage work durations (agent run time).
 * Excludes idle gaps waiting for user approval between stages.
 */
export function runWorkDurationMs(stageDurationsMs: Array<number | null | undefined>): number | null {
  const parts = stageDurationsMs.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
  if (parts.length === 0) return null;
  return parts.reduce((sum, n) => sum + n, 0);
}

/** @deprecated Prefer runWorkDurationMs — wall-clock inflates approval-mode waits. */
export function runTotalDurationMs(
  createdAt: Date | string,
  updatedAt: Date | string,
  stageCompletedAts: Array<Date | string | null>
): number | null {
  const start = typeof createdAt === "string" ? Date.parse(createdAt) : createdAt.getTime();
  if (!Number.isFinite(start)) return null;
  const completedMs = stageCompletedAts
    .map((d) => (d == null ? null : typeof d === "string" ? Date.parse(d) : d.getTime()))
    .filter((n): n is number => n != null && Number.isFinite(n));
  const end = completedMs.length > 0 ? Math.max(...completedMs) : typeof updatedAt === "string" ? Date.parse(updatedAt) : updatedAt.getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  let minutes = Math.floor(seconds / 60);
  let restSec = Math.round(seconds % 60);
  if (restSec === 60) {
    minutes += 1;
    restSec = 0;
  }
  if (minutes < 60) return restSec > 0 ? `${minutes}m ${restSec}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  return restMin > 0 ? `${hours}h ${restMin}m` : `${hours}h`;
}
