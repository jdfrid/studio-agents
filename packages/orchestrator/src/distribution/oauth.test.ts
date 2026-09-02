import { describe, expect, it } from "vitest";
import { signOAuthState, verifyOAuthState } from "./oauth.js";

describe("distribution oauth state", () => {
  it("round-trips a signed payload", () => {
    process.env.JWT_SECRET = "test-secret-for-oauth-state";
    const token = signOAuthState({
      tenantId: "t1",
      userId: "u1",
      network: "youtube",
      codeVerifier: "abc"
    });
    const parsed = verifyOAuthState(token);
    expect(parsed.tenantId).toBe("t1");
    expect(parsed.network).toBe("youtube");
    expect(parsed.codeVerifier).toBe("abc");
  });

  it("rejects a tampered token", () => {
    process.env.JWT_SECRET = "test-secret-for-oauth-state";
    const token = signOAuthState({ tenantId: "t1", userId: "u1", network: "x" });
    expect(() => verifyOAuthState(`${token}x`)).toThrow();
  });
});
