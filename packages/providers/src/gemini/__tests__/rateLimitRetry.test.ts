import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ProviderError } from "@studio/shared";
import {
  isGeminiRateLimitError,
  rateLimitRetryDelayMs,
  withGeminiRateLimitRetry
} from "../rateLimitRetry.js";

describe("Gemini Veo rate-limit retry", () => {
  const prevAttempts = process.env.GEMINI_VEO_429_MAX_ATTEMPTS;

  beforeEach(() => {
    process.env.GEMINI_VEO_429_MAX_ATTEMPTS = "4";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (prevAttempts === undefined) delete process.env.GEMINI_VEO_429_MAX_ATTEMPTS;
    else process.env.GEMINI_VEO_429_MAX_ATTEMPTS = prevAttempts;
  });

  it("detects ProviderError rate_limit / 429", () => {
    expect(
      isGeminiRateLimitError(
        new ProviderError("quota", {
          provider: "gemini",
          metadata: { status: 429, kind: "rate_limit", raw: "RESOURCE_EXHAUSTED" }
        })
      )
    ).toBe(true);
    expect(isGeminiRateLimitError(new Error("boom"))).toBe(false);
  });

  it("honors Retry-After seconds in delay", () => {
    const err = new ProviderError("wait", {
      provider: "gemini",
      metadata: { status: 429, kind: "rate_limit", retryAfter: "12" }
    });
    expect(rateLimitRetryDelayMs(1, err)).toBe(12_000);
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const waits: number[] = [];
    const promise = withGeminiRateLimitRetry(
      "test",
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new ProviderError("rate limited", {
            provider: "gemini",
            metadata: { status: 429, kind: "rate_limit", raw: "RESOURCE_EXHAUSTED" }
          });
        }
        return "ok";
      },
      async (info) => {
        waits.push(info.delayMs);
      }
    );

    const assertion = expect(promise).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(calls).toBe(2);
    expect(waits).toEqual([15_000]);
  });

  it("does not treat prepayment depletion as retryable rate limit", () => {
    const err = new ProviderError("depleted", {
      provider: "gemini",
      metadata: {
        status: 429,
        kind: "billing_quota",
        raw: "Your prepayment credits are depleted. Please go to AI Studio"
      }
    });
    expect(isGeminiRateLimitError(err)).toBe(false);
  });

  it("does not retry non-rate-limit errors", async () => {
    await expect(
      withGeminiRateLimitRetry("test", async () => {
        throw new ProviderError("auth", {
          provider: "gemini",
          metadata: { status: 401, kind: "auth" }
        });
      })
    ).rejects.toMatchObject({ message: "auth" });
  });
});
