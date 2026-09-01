import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@studio/shared";

export interface SessionPayload {
  sub: string;
  email: string;
  role: UserRole;
  tokenUse?: "session" | "mobile_access";
}

const COOKIE_NAME = "studio_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

/** Shared across subdomains (e.g. admin.prompt2spot.com + prompt2spot.com) for OAuth callback. */
export function sessionCookieDomain(): string | undefined {
  const explicit = process.env.COOKIE_DOMAIN?.trim();
  if (explicit) return explicit.startsWith(".") ? explicit : `.${explicit}`;
  const app = (process.env.APP_URL ?? "").trim();
  if (!app) return undefined;
  try {
    const host = new URL(app).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return undefined;
    const parts = host.split(".");
    if (parts.length >= 2) return `.${parts.slice(-2).join(".")}`;
  } catch {
    // ignore
  }
  return undefined;
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role, tokenUse: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secretKey());
}

export async function signMobileAccess(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role, tokenUse: "mobile_access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setAudience("studio-mobile-admin")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const sub = payload.sub;
    const email = payload.email;
    const role = payload.role;
    if (typeof sub !== "string" || typeof email !== "string" || typeof role !== "string") return null;
    const tokenUse = payload.tokenUse;
    if (tokenUse !== undefined && tokenUse !== "session" && tokenUse !== "mobile_access") return null;
    return { sub, email, role: role as UserRole, tokenUse };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean, maxAge = MAX_AGE_SEC) {
  const domain = sessionCookieDomain();
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {})
  };
}

export function sessionCookieClearOptions() {
  const domain = sessionCookieDomain();
  return {
    path: "/",
    ...(domain ? { domain } : {})
  };
}

export function isAuthDisabled(): boolean {
  return process.env.AUTH_DISABLED === "1";
}

export function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}
