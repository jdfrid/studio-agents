import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SocialNetwork } from "@studio/shared";

export interface DistributionOAuthState {
  tenantId: string;
  userId: string;
  network: SocialNetwork;
  codeVerifier?: string;
  exp: number;
}

function secret(): Buffer {
  const raw = process.env.JWT_SECRET || process.env.SECRETS_KEY_BASE64;
  if (!raw) throw new Error("JWT_SECRET is required for social OAuth");
  return Buffer.from(raw);
}

export function signOAuthState(payload: Omit<DistributionOAuthState, "exp">, ttlMs = 15 * 60_000): string {
  const body: DistributionOAuthState = { ...payload, exp: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(token: string): DistributionOAuthState {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) throw new Error("invalid oauth state");
  const expected = createHmac("sha256", secret()).update(encoded).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("invalid oauth state");
  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DistributionOAuthState;
  if (parsed.exp < Date.now()) throw new Error("oauth state expired");
  return parsed;
}

export function newOAuthNonce(): string {
  return randomBytes(12).toString("hex");
}

export function oauthCallbackUrl(network: SocialNetwork): string {
  const explicit = process.env.DISTRIBUTION_OAUTH_CALLBACK_BASE?.replace(/\/$/, "");
  if (explicit) return `${explicit}/distribution/oauth/${network}/callback`;
  const api = process.env.API_PUBLIC_URL?.replace(/\/$/, "");
  if (api) return `${api}/distribution/oauth/${network}/callback`;
  const app = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return `${app}/api/distribution/oauth/${network}/callback`;
}

export function oauthReturnUrl(query: Record<string, string>): string {
  const app = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const params = new URLSearchParams(query);
  return `${app}/distribution?${params.toString()}`;
}
