import { afterEach, describe, expect, it } from "vitest";
import { mobileRedirectUri } from "./mobileAuth.js";
import { signMobileAccess, verifySession } from "./jwt.js";
import { requireAdmin } from "./routes.js";
import type { FastifyReply, FastifyRequest } from "fastify";

const originalSecret = process.env.JWT_SECRET;
const originalRedirect = process.env.MOBILE_ADMIN_REDIRECT_URI;
const originalAuthDisabled = process.env.AUTH_DISABLED;

afterEach(() => {
  process.env.JWT_SECRET = originalSecret;
  process.env.MOBILE_ADMIN_REDIRECT_URI = originalRedirect;
  process.env.AUTH_DISABLED = originalAuthDisabled;
});

describe("mobile admin auth", () => {
  it("issues short-lived mobile access tokens with explicit token use", async () => {
    process.env.JWT_SECRET = "test-secret-at-least-32-characters-long";
    const token = await signMobileAccess({ sub: "admin-1", email: "admin@example.com", role: "ADMIN" });
    await expect(verifySession(token)).resolves.toMatchObject({
      sub: "admin-1",
      role: "ADMIN",
      tokenUse: "mobile_access"
    });
  });

  it("only accepts the private mobile custom scheme", () => {
    process.env.MOBILE_ADMIN_REDIRECT_URI = "https://evil.example/callback";
    expect(() => mobileRedirectUri()).toThrow(/studioadmin/);
    process.env.MOBILE_ADMIN_REDIRECT_URI = "studioadmin://oauth/callback";
    expect(mobileRedirectUri()).toBe("studioadmin://oauth/callback");
  });

  it("rejects a valid non-admin bearer token from admin routes", async () => {
    process.env.JWT_SECRET = "test-secret-at-least-32-characters-long";
    process.env.AUTH_DISABLED = "0";
    const token = await signMobileAccess({ sub: "user-1", email: "user@example.com", role: "USER" });
    const request = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as unknown as FastifyRequest;
    let status = 200;
    let body: unknown;
    const reply = {
      code(value: number) {
        status = value;
        return this;
      },
      send(value: unknown) {
        body = value;
        return this;
      }
    } as unknown as FastifyReply;
    await requireAdmin()(request, reply);
    expect(status).toBe(403);
    expect(body).toEqual({ error: "forbidden" });
  });
});
