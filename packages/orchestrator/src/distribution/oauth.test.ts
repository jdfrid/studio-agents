import { describe, expect, it } from "vitest";
import { oauthCallbackUrl, parseOAuthCallbackQuery, signOAuthState, verifyOAuthState } from "./oauth.js";

describe("distribution oauth state", () => {
  it("round-trips a signed payload", () => {
    process.env.JWT_SECRET = "test-secret-for-oauth-state";
    const token = signOAuthState({
      tenantId: "t1",
      userId: "u1",
      network: "youtube",
      codeVerifier: "abc",
      redirectUri: "https://prompt2spot.com/api/distribution/oauth/youtube/callback"
    });
    const parsed = verifyOAuthState(token);
    expect(parsed.tenantId).toBe("t1");
    expect(parsed.network).toBe("youtube");
    expect(parsed.codeVerifier).toBe("abc");
    expect(parsed.redirectUri).toContain("/youtube/callback");
  });

  it("rejects a tampered token", () => {
    process.env.JWT_SECRET = "test-secret-for-oauth-state";
    const token = signOAuthState({ tenantId: "t1", userId: "u1", network: "x" });
    expect(() => verifyOAuthState(`${token}x`)).toThrow();
  });
});

describe("oauthCallbackUrl", () => {
  it("reuses the Google login callback for YouTube when sharing site credentials", () => {
    const prev = {
      API_PUBLIC_URL: process.env.API_PUBLIC_URL,
      DISTRIBUTION_OAUTH_CALLBACK_BASE: process.env.DISTRIBUTION_OAUTH_CALLBACK_BASE,
      APP_URL: process.env.APP_URL,
      YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID
    };
    delete process.env.API_PUBLIC_URL;
    delete process.env.DISTRIBUTION_OAUTH_CALLBACK_BASE;
    delete process.env.YOUTUBE_CLIENT_ID;
    process.env.APP_URL = "https://prompt2spot.com";
    process.env.GOOGLE_CLIENT_ID = "site-google-client";
    try {
      expect(oauthCallbackUrl("youtube")).toBe("https://prompt2spot.com/auth/google/callback");
      expect(oauthCallbackUrl("facebook")).toBe(
        "https://prompt2spot.com/api/distribution/oauth/facebook/callback"
      );
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("parseOAuthCallbackQuery", () => {
  it("reads code from the raw URL when Fastify query is empty", () => {
    const parsed = parseOAuthCallbackQuery({
      query: {},
      url: "/distribution/oauth/youtube/callback?code=abc&state=xyz"
    });
    expect(parsed.code).toBe("abc");
    expect(parsed.state).toBe("xyz");
  });

  it("prefers parsed query values", () => {
    const parsed = parseOAuthCallbackQuery({
      query: { code: "from-query", state: "st" },
      url: "/distribution/oauth/youtube/callback?code=from-url&state=st"
    });
    expect(parsed.code).toBe("from-query");
  });
});
