import type { CostChargedStatus, CostUsageRecord } from "@studio/shared";

export type GeminiUsageEvent = Omit<CostUsageRecord, "startedAt"> & {
  startedAt?: Date;
};

export type GeminiUsageReporter = (event: GeminiUsageEvent) => void | Promise<void>;

export function mapUsageToCost(event: GeminiUsageEvent): Omit<CostUsageRecord, never> {
  return {
    activityType: event.activityType,
    sceneId: event.sceneId,
    model: event.model,
    startedAt: event.startedAt,
    durationMs: event.durationMs,
    billedUnits: event.billedUnits,
    unit: event.unit,
    charged: event.charged,
    metadata: event.metadata,
    generateAudio: event.generateAudio
  };
}

export function notChargedFromMessage(message: string): CostChargedStatus {
  const lower = message.toLowerCase();
  if (lower.includes("not been charged") || lower.includes("not charged")) return "no";
  return "yes";
}
