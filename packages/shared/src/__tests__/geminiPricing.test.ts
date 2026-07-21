import { describe, expect, it } from "vitest";
import { normalizeUsageMetadata, priceFromUsageMetadata, tokenRatesForModel } from "../geminiPricing.js";

describe("tokenRatesForModel", () => {
  it("resolves known model prefixes", () => {
    expect(tokenRatesForModel("gemini-2.5-flash").inputUsdPerMillion).toBe(0.15);
    expect(tokenRatesForModel("gemini-3.5-flash").outputUsdPerMillion).toBe(9);
  });

  it("falls back for unknown models", () => {
    expect(tokenRatesForModel("unknown-model").inputUsdPerMillion).toBe(0.15);
  });
});

describe("priceFromUsageMetadata", () => {
  it("computes usd from input and output tokens", () => {
    const usage = normalizeUsageMetadata({
      promptTokenCount: 1_000_000,
      candidatesTokenCount: 100_000,
      totalTokenCount: 1_100_000
    })!;
    const { usd, inputTokens, outputTokens } = priceFromUsageMetadata("gemini-2.5-flash", usage);
    expect(inputTokens).toBe(1_000_000);
    expect(outputTokens).toBe(100_000);
    expect(usd).toBeCloseTo(0.15 + 0.06, 4);
  });
});
