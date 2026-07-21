import { describe, expect, it } from "vitest";
import {
  computeCostAmounts,
  priceGeminiImage,
  priceVeoScene,
  summarizeRunCosts,
  type CostEventView
} from "../costLedger.js";
import { normalizeUsageMetadata } from "../geminiPricing.js";

describe("costLedger", () => {
  it("prices Veo fast scene", () => {
    const { usd } = priceVeoScene("veo-3.1-fast-generate-preview", 4, false);
    expect(usd).toBeCloseTo(0.32, 2);
  });

  it("prices image call", () => {
    expect(priceGeminiImage().usd).toBe(0.04);
  });

  it("returns zero when not charged", () => {
    const { costNis } = computeCostAmounts("veo_video", 6, { charged: "no" });
    expect(costNis).toBe(0);
  });

  it("prices from usageMetadata when provided", () => {
    const usage = normalizeUsageMetadata({
      promptTokenCount: 1_000_000,
      candidatesTokenCount: 100_000,
      totalTokenCount: 1_100_000
    })!;
    const { costUsd, costNis } = computeCostAmounts("gemini_text", usage.totalTokenCount, {
      model: "gemini-2.5-flash",
      usageMetadata: usage,
      pricingSource: "usage_metadata"
    });
    expect(costUsd).toBeCloseTo(0.21, 2);
    expect(costNis).toBeGreaterThan(0);
  });

  it("falls back to flat estimate without usageMetadata", () => {
    const { costUsd } = computeCostAmounts("gemini_text", 1, { pricingSource: "estimate" });
    expect(costUsd).toBe(0.002);
  });
  it("summarizes run events", () => {
    const events: CostEventView[] = [
      {
        id: "1",
        tenantId: "t1",
        runId: "r1",
        stage: "render",
        activityType: "veo_video",
        billedUnits: 4,
        unit: "veo_seconds",
        costUsd: 0.32,
        costNis: 1.15,
        charged: "yes",
        startedAt: new Date(),
        attempt: 1
      },
      {
        id: "2",
        tenantId: "t1",
        runId: "r1",
        stage: "asset",
        activityType: "gemini_image",
        billedUnits: 1,
        unit: "image_call",
        costUsd: 0.04,
        costNis: 0.14,
        charged: "yes",
        startedAt: new Date(),
        attempt: 1
      }
    ];
    const summary = summarizeRunCosts(events);
    expect(summary.totalNis).toBeCloseTo(1.29, 2);
    expect(summary.byActivity.veo_video?.count).toBe(1);
  });
});
