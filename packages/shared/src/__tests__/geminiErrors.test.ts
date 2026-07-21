import { describe, expect, it } from "vitest";
import {
  buildStageErrorRecord,
  classifyGeminiError,
  formatApiErrorMessage,
  parseStageError,
  userFacingGeminiError
} from "../geminiErrors.js";
import { ProviderError } from "../errors.js";

describe("classifyGeminiError", () => {
  it("treats generic 429 quota as rate limit (not billing)", () => {
    const raw = `429 { "error": { "code": 429, "message": "You exceeded your current quota", "status": "RESOURCE_EXHAUSTED" } }`;
    expect(classifyGeminiError(raw, 429)).toBe("rate_limit");
    expect(userFacingGeminiError(raw, 429)).toContain("מגבלת קצב");
    expect(userFacingGeminiError(raw, 429)).not.toContain("Prepay");
  });

  it("detects billing when payment keywords present", () => {
    const raw = `402 { "error": { "message": "Payment required — insufficient credit balance" } }`;
    expect(classifyGeminiError(raw, 402)).toBe("billing_quota");
  });
});

describe("buildStageErrorRecord", () => {
  it("stores raw Google response in JSON", () => {
    const raw = `429 {"error":{"code":429,"message":"quota exceeded","status":"RESOURCE_EXHAUSTED"}}`;
    const record = buildStageErrorRecord(
      new ProviderError("friendly", { provider: "gemini", metadata: { status: 429, raw } })
    );
    const parsed = parseStageError(record);
    expect(parsed.raw).toContain("RESOURCE_EXHAUSTED");
    expect(parsed.kind).toBe("rate_limit");
    expect(parsed.friendly).toContain("מגבלת קצב");
  });

  it("parses legacy plain-text errors", () => {
    const legacy = "נגמרו קרדיטים ב-Google AI Studio";
    const parsed = parseStageError(legacy);
    expect(parsed.friendly).toBeTruthy();
    expect(parsed.raw).toBe(legacy);
  });
});

describe("formatApiErrorMessage", () => {
  it("hides api key", () => {
    const msg = formatApiErrorMessage(
      '429 {"error":"HTTP 429 for https://generativelanguage.googleapis.com?key=AIzaSySecret123: quota exceeded"}'
    );
    expect(msg).toContain("מגבלת קצב");
    expect(msg).not.toContain("AIzaSySecret");
  });

  it("maps celebrity likeness blocks to Hebrew", () => {
    const msg = formatApiErrorMessage(
      "Gemini Veo operation failed: Sorry, we can't create videos with real people's names or likenesses."
    );
    expect(msg).toContain("סלבריטאים");
  });
});
