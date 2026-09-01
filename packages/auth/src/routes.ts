import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import {
  exchangeGoogleCode,
  googleAuthUrl,
  appUrl
} from "./google.js";
import type { UserView } from "@studio/shared";
import { getUserViewWithCredits, findOrCreateUser } from "./users.js";
import { recordUserLogin } from "./loginAudit.js";
import { isAuthDisabled, sessionCookieName, sessionCookieOptions, sessionCookieClearOptions, signSession, verifySession, type SessionPayload } from "./jwt.js";
import {
  createMobileAuthCode,
  exchangeMobileAuthCode,
  mobileRedirectUri,
  revokeMobileDevice,
  rotateMobileRefreshToken
} from "./mobileAuth.js";

async function devUserView(): Promise<UserView> {
  const profile = {
    googleId: "dev-local",
    email: process.env.ADMIN_EMAILS?.split(",")[0]?.trim() || "dev@local.test",
    name: "Dev Admin"
  };
  const user = await findOrCreateUser(profile);
  return (await getUserViewWithCredits(user.id)) ?? user;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionPayload;
  }
}

function adminUrl(): string {
  return (process.env.ADMIN_URL ?? "").replace(/\/$/, "");
}

function requestWantsAdminUi(request: FastifyRequest): boolean {
  const admin = adminUrl();
  if (!admin) return false;
  try {
    const adminHost = new URL(admin).hostname.toLowerCase();
    const host = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "")
      .split(",")[0]
      ?.trim()
      .toLowerCase()
      .replace(/:\d+$/, "");
    if (host && host === adminHost) return true;
    const referer = String(request.headers.referer ?? "");
    if (referer && new URL(referer).hostname.toLowerCase() === adminHost) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/auth/mobile/google", async (request, reply) => {
    const { deviceId } = request.query as { deviceId?: string };
    if (!deviceId || deviceId.length > 200) {
      return reply.code(400).send({ error: "invalid_device_id" });
    }
    const state = randomBytes(16).toString("hex");
    const cookieOpts = { ...sessionCookieOptions(isSecure()), maxAge: 600, httpOnly: true };
    reply.setCookie("mobile_oauth_state", state, cookieOpts);
    reply.setCookie("mobile_oauth_device", deviceId, cookieOpts);
    reply.redirect(googleAuthUrl(state));
  });

  app.get("/auth/google", async (request, reply) => {
    const state = randomBytes(16).toString("hex");
    const cookieOpts = { ...sessionCookieOptions(isSecure()), maxAge: 600, httpOnly: true };
    reply.setCookie("oauth_state", state, cookieOpts);
    const returnTo = requestWantsAdminUi(request) ? adminUrl() : appUrl();
    if (returnTo) {
      reply.setCookie("oauth_return", returnTo, cookieOpts);
    }
    reply.redirect(googleAuthUrl(state));
  });

  app.get("/auth/google/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    const savedState = request.cookies?.oauth_state;
    const mobileState = request.cookies?.mobile_oauth_state;
    const isMobile = Boolean(state && mobileState && state === mobileState);
    if (!code || !state || (!isMobile && state !== savedState)) {
      reply.code(400).send({ error: "invalid_oauth_state" });
      return;
    }
    const oauthReturn = (request.cookies?.oauth_return ?? "").replace(/\/$/, "");
    reply.clearCookie("oauth_state", sessionCookieClearOptions());
    reply.clearCookie("oauth_return", sessionCookieClearOptions());
    const profile = await exchangeGoogleCode(code);
    const user = await findOrCreateUser(profile);
    await recordUserLogin(user.id, request);
    if (isMobile) {
      const deviceId = request.cookies?.mobile_oauth_device;
      reply.clearCookie("mobile_oauth_state", sessionCookieClearOptions());
      reply.clearCookie("mobile_oauth_device", sessionCookieClearOptions());
      if (!deviceId || user.role !== "ADMIN") {
        return reply.code(403).send({ error: "admin_required" });
      }
      const mobileCode = await createMobileAuthCode(user.id, deviceId);
      const redirect = new URL(mobileRedirectUri());
      redirect.searchParams.set("code", mobileCode);
      return reply.redirect(redirect.toString());
    }
    const token = await signSession({ sub: user.id, email: user.email, role: user.role });
    reply.setCookie(sessionCookieName(), token, sessionCookieOptions(isSecure()));
    const admin = adminUrl();
    // Only send admins to the admin UI when they started OAuth from there (oauth_return).
    // Forcing ADMIN→admin on every login broke browser Back from the app (history landed on admin).
    const dest =
      oauthReturn && admin && oauthReturn === admin
        ? admin
        : oauthReturn && oauthReturn.startsWith(appUrl())
          ? oauthReturn
          : appUrl();
    reply.redirect(dest);
  });

  app.get("/auth/me", async (request, reply) => {
    if (isAuthDisabled()) {
      return devUserView();
    }
    const session = await resolveSession(request);
    if (!session) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const user = await getUserViewWithCredits(session.sub);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    return user;
  });

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(sessionCookieName(), sessionCookieClearOptions());
    return { ok: true };
  });

  app.post("/auth/mobile/exchange", async (request, reply) => {
    const body = request.body as { code?: string; deviceId?: string };
    if (!body?.code || !body.deviceId || body.deviceId.length > 200) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    try {
      return await exchangeMobileAuthCode(body.code, body.deviceId);
    } catch {
      return reply.code(401).send({ error: "invalid_mobile_auth_code" });
    }
  });

  app.post("/auth/mobile/refresh", async (request, reply) => {
    const body = request.body as { refreshToken?: string; deviceId?: string };
    if (!body?.refreshToken || !body.deviceId) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    try {
      return await rotateMobileRefreshToken(body.refreshToken, body.deviceId);
    } catch {
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }
  });

  app.post("/auth/mobile/logout", { preHandler: requireAdmin() }, async (request, reply) => {
    const body = request.body as { deviceId?: string };
    if (!body?.deviceId) return reply.code(400).send({ error: "invalid_request" });
    await revokeMobileDevice(request.user!.sub, body.deviceId);
    return { ok: true };
  });
}

export async function resolveSession(request: FastifyRequest): Promise<SessionPayload | null> {
  const header = request.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const cookie = request.cookies?.[sessionCookieName()];
  const token = bearer ?? cookie;
  if (!token) return null;
  return verifySession(token);
}

export function requireAuth() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (isAuthDisabled()) {
      const dev = await devUserView();
      request.user = { sub: dev.id, email: dev.email, role: dev.role };
      return;
    }
    const session = await resolveSession(request);
    if (!session) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    request.user = session;
  };
}

export function requireAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (isAuthDisabled()) {
      const dev = await devUserView();
      if (dev.role !== "ADMIN") {
        reply.code(403).send({ error: "forbidden" });
        return;
      }
      request.user = { sub: dev.id, email: dev.email, role: dev.role };
      return;
    }
    const session = await resolveSession(request);
    if (!session || session.role !== "ADMIN") {
      reply.code(403).send({ error: "forbidden" });
      return;
    }
    request.user = session;
  };
}

function isSecure(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export async function authPlugin(app: FastifyInstance) {
  await app.register(import("@fastify/cookie"));
}
