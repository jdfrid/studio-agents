import { describe, expect, it } from "vitest";
import { classifyGeminiError, formatApiErrorMessage, userFacingGeminiError } from "../geminiErrors.js";

describe("geminiErrors", () => {
  it("detects billing/quota exhaustion", () => {
    const raw = `HTTP 429: { "error": { "code": 429, "message": "You exceeded your current quota", "status": "RESOURCE_EXHAUSTED" } }`;
    expect(classifyGeminiError(raw, 429)).toBe("billing_quota");
    expect(userFacingGeminiError(raw, 429)).toContain("הגעת למגבלת התקציב");
  });

  it("formats api error and hides api key", () => {
    const msg = formatApiErrorMessage(
      '429 {"error":"HTTP 429 for https://generativelanguage.googleapis.com?key=AIzaSySecret123: quota exceeded"}'
    );
    expect(msg).toContain("הגעת למגבלת התקציב");
    expect(msg).not.toContain("AIzaSySecret");
  });

  it("passes through unknown errors truncated", () => {
    const msg = formatApiErrorMessage("500 internal server error");
    expect(msg).toContain("500");
  });
});
