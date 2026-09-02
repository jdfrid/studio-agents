import { decryptSecret, encryptSecret } from "../crypto.js";
import type { SocialTokens } from "./types.js";

export function encryptTokens(tokens: SocialTokens): string {
  return encryptSecret(JSON.stringify(tokens));
}

export function decryptTokens(payload: string): SocialTokens {
  const parsed = JSON.parse(decryptSecret(payload)) as SocialTokens;
  if (!parsed?.accessToken && !parsed?.botToken) {
    throw new Error("invalid social token payload");
  }
  if (!parsed.accessToken && parsed.botToken) parsed.accessToken = parsed.botToken;
  return parsed;
}

export function tokenExpired(tokens: SocialTokens, skewMs = 60_000): boolean {
  if (!tokens.expiresAt) return false;
  const at = Date.parse(tokens.expiresAt);
  if (Number.isNaN(at)) return false;
  return at - skewMs <= Date.now();
}
