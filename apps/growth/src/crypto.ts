import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ALGO = "aes-256-gcm";

export function secretsKey(dataDir: string): Buffer {
  const fromEnv = process.env.GROWTH_SECRETS_KEY?.trim();
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, "base64");
    if (buf.length !== 32) throw new Error("GROWTH_SECRETS_KEY must decode to 32 bytes");
    return buf;
  }
  const file = path.join(dataDir, "secret.key");
  if (existsSync(file)) return readFileSync(file);
  const key = randomBytes(32);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, key, { mode: 0o600 });
  return key;
}

export function sessionSecret(dataDir: string): string {
  const fromEnv = process.env.GROWTH_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  return secretsKey(dataDir).toString("base64url");
}

export function encryptJson(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptJson<T>(payload: string, key: Buffer): T {
  const [ivB64, tagB64, encB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !encB64) throw new Error("invalid encrypted payload");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64url")), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function nid(): string {
  return randomBytes(9).toString("hex");
}

export function signPayload(payload: unknown, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHash("sha256").update(`${secret}.${encoded}`).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyPayload<T>(token: string, secret: string): T {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) throw new Error("invalid state");
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHash("sha256").update(`${secret}.${encoded}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("invalid state");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
}
