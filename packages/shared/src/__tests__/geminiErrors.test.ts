import { describe, expect, it } from "vitest";
import { classifyGeminiError, formatApiErrorMessage, userFacingGeminiError } from "../geminiErrors.js";

describe("geminiErrors", () => {
  it("detects billing/quota exhaustion", () => {
    const raw = `HTTP 429: { "error": { "code": 429, "message": "You exceeded your current quota", "status": "RESOURCE_EXHAUSTED" } }`;
    expect(classifyGeminiError(raw, 429)).toBe("billing_quota");
    expect(userFacingGeminiError(raw, 429)).toContain("Google AI Studio");
  });

  it("formats api error and hides api key", () => {
    const msg = formatApiErrorMessage(
      '429 {"error":"HTTP 429 for https://generativelanguage.googleapis.com?key=AIzaSySecret123: quota exceeded"}'
    );
    expect(msg).toContain("Google AI Studio");
    expect(msg).not.toContain("AIzaSySecret");
  });

  it("maps celebrity likeness blocks to Hebrew", () => {
    const msg = formatApiErrorMessage(
      "Gemini Veo operation failed: Sorry, we can't create videos with real people's names or likenesses. Please remove the celebrity reference and try again."
    );
    expect(msg).toContain("סלבריטאים");
    expect(msg).not.toContain("celebrity reference");
  });

  it("passes through unknown errors truncated", () => {
    const msg = formatApiErrorMessage("500 internal server error");
    expect(msg).toContain("500");
  });
});
