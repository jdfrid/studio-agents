import { describe, expect, it } from "vitest";
import { extractUsageMetadata } from "../usageMetadata.js";

describe("extractUsageMetadata", () => {
  it("parses camelCase usageMetadata", () => {
    const usage = extractUsageMetadata({
      candidates: [{ content: { parts: [{ text: "hi" }] } }],
      usageMetadata: {
        promptTokenCount: 1000,
        candidatesTokenCount: 200,
        totalTokenCount: 1250,
        cachedContentTokenCount: 100,
        thoughtsTokenCount: 50
      }
    });
    expect(usage).not.toBeNull();
    expect(usage!.billableInputTokens).toBe(900);
    expect(usage!.billableOutputTokens).toBe(250);
    expect(usage!.totalTokenCount).toBe(1250);
  });

  it("parses snake_case usage_metadata", () => {
    const usage = extractUsageMetadata({
      usage_metadata: {
        prompt_token_count: 500,
        candidates_token_count: 80,
        total_token_count: 580
      }
    });
    expect(usage!.billableInputTokens).toBe(500);
    expect(usage!.billableOutputTokens).toBe(80);
  });

  it("returns null when usage missing", () => {
    expect(extractUsageMetadata({ candidates: [] })).toBeNull();
    expect(extractUsageMetadata(null)).toBeNull();
  });
});
