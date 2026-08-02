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
    if (!code || !state || state !== savedState) {
      reply.code(400).send({ error: "invalid_oauth_state" });
      return;
    }
    const oauthReturn = (request.cookies?.oauth_return ?? "").replace(/\/$/, "");
    reply.clearCookie("oauth_state", sessionCookieClearOptions());
    reply.clearCookie("oauth_return", sessionCookieClearOptions());
    const profile = await exchangeGoogleCode(code);
    const user = await findOrCreateUser(profile);
    await recordUserLogin(user.id, request);
    const token = await signSession({ sub: user.id, email: user.email, role: user.role });
    reply.setCookie(sessionCookieName(), token, sessionCookieOptions(isSecure()));
    const admin = adminUrl();
    const dest =
      (oauthReturn && admin && oauthReturn === admin ? admin : null) ||
      (user.role === "ADMIN" && admin ? admin : null) ||
      appUrl();
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
