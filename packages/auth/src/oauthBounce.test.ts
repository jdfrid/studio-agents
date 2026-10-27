import { describe, expect, it } from "vitest";
import { growthOAuthBounceUrl, growthOAuthNetwork } from "./oauthBounce.js";

function state(payload: unknown): string {
  return `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
}

describe("growth oauth bounce", () => {
  it("sends a growth YouTube return back to the growth console", () => {
    const token = state({ network: "youtube", via: "growth", exp: 1 });
    expect(growthOAuthNetwork(token)).toBe("youtube");
    const url = growthOAuthBounceUrl(token, { code: "abc", state: token }, "https://growth.reelmino.com");
    expect(url).toBe(`https://growth.reelmino.com/oauth/youtube/callback?code=abc&state=${encodeURIComponent(token)}`);
  });

  it("leaves site login and product distribution on their own callbacks", () => {
    expect(growthOAuthNetwork("plain-login-state")).toBeNull();
    expect(growthOAuthNetwork(state({ network: "youtube", tenantId: "t1", userId: "u1" }))).toBeNull();
    expect(growthOAuthBounceUrl(state({ network: "youtube", tenantId: "t1" }), { code: "abc" })).toBeNull();
  });
});
