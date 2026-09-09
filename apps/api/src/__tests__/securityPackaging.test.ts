import { describe, expect, it } from "vitest";
import { consumeRateLimit } from "../rateLimit.js";
import { corsOrigins } from "../securityHeaders.js";

describe("consumeRateLimit", () => {
  it("allows traffic under the limit and blocks after it", () => {
    const key = `test-${Date.now()}`;
    expect(consumeRateLimit(key, 2, 60_000)).toBe(true);
    expect(consumeRateLimit(key, 2, 60_000)).toBe(true);
    expect(consumeRateLimit(key, 2, 60_000)).toBe(false);
  });
});

describe("corsOrigins", () => {
  it("does not default to reflecting any origin in production", () => {
    const prevNode = process.env.NODE_ENV;
    const prevCors = process.env.CORS_ORIGINS;
    const prevApp = process.env.APP_URL;
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ORIGINS;
    process.env.APP_URL = "https://prompt2spot.com";
    expect(corsOrigins()).toEqual(["https://prompt2spot.com"]);
    process.env.NODE_ENV = prevNode;
    if (prevCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prevCors;
    if (prevApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevApp;
  });
});
