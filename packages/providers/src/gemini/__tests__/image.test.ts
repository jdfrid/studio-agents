import { describe, expect, it } from "vitest";
import { describeGenerateContentFailure, normalizeGeminiImageAspectRatio } from "../common.js";

describe("gemini image helpers", () => {
  it("normalizes supported aspect ratios", () => {
    expect(normalizeGeminiImageAspectRatio("9:16")).toBe("9:16");
    expect(normalizeGeminiImageAspectRatio("16:9")).toBe("16:9");
    expect(normalizeGeminiImageAspectRatio("weird")).toBe("9:16");
  });

  it("describes blocked or text-only responses", () => {
    const detail = describeGenerateContentFailure({
      promptFeedback: { blockReason: "SAFETY" },
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "cannot generate" }] } }]
    });
    expect(detail).toContain("blockReason=SAFETY");
    expect(detail).toContain("cannot generate");
  });
});
