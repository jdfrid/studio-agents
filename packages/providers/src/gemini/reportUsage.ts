import type { CostActivityType, CostBilledUnit, CostPricingSource, GeminiUsageMetadata } from "@studio/shared";
import { extractUsageMetadata } from "./usageMetadata.js";
import type { GeminiUsageReporter } from "./usage.js";

export type GenerateContentUsageContext = {
  activityType: CostActivityType;
  model: string;
  startedMs: number;
  sceneId?: string | null;
  /** Used for estimate fallback (e.g. TTS char count). */
  fallbackBilledUnits?: number;
};

/** Report cost from generateContent response usageMetadata, or flat estimate fallback. */
export async function reportGenerateContentUsage(
  response: unknown,
  ctx: GenerateContentUsageContext,
  onUsage?: GeminiUsageReporter
): Promise<void> {
  if (!onUsage) return;
  const usage = extractUsageMetadata(response);
  const durationMs = Date.now() - ctx.startedMs;

  if (usage) {
    await onUsage({
      activityType: ctx.activityType,
      sceneId: ctx.sceneId,
      model: ctx.model,
      durationMs,
      billedUnits: usage.totalTokenCount,
      unit: "tokens" as CostBilledUnit,
      inputTokens: usage.billableInputTokens,
      outputTokens: usage.billableOutputTokens,
      pricingSource: "usage_metadata" as CostPricingSource,
      usageMetadata: usage,
      charged: "yes",
      metadata: { usageMetadata: usage.raw, pricingSource: "usage_metadata" }
    });
    return;
  }

  const fallbackUnit = fallbackUnitForActivity(ctx.activityType);
  await onUsage({
    activityType: ctx.activityType,
    sceneId: ctx.sceneId,
    model: ctx.model,
    durationMs,
    billedUnits: ctx.fallbackBilledUnits ?? 1,
    unit: fallbackUnit,
    pricingSource: "estimate" as CostPricingSource,
    charged: "yes",
    metadata: { pricingSource: "estimate" }
  });
}

function fallbackUnitForActivity(activityType: CostActivityType): CostBilledUnit {
  switch (activityType) {
    case "gemini_tts":
      return "tts_call";
    case "gemini_image":
      return "image_call";
    case "gemini_music":
      return "music_seconds";
    default:
      return "text_call";
  }
}

export type { GeminiUsageMetadata };
