import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
const apiBase = configuredApiBase || (import.meta.env.DEV ? "http://localhost:4000" : "https://mobile-admin-api.invalid");
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

async function storageReady() {
  await SecureStorage.setKeyPrefix("prompt2spot_admin_");
}

export async function deviceId(): Promise<string> {
  await storageReady();
  const existing = await SecureStorage.get("device_id");
  if (typeof existing === "string" && existing) return existing;
  const id = crypto.randomUUID();
  await SecureStorage.set("device_id", id);
  return id;
}

async function saveTokens(tokens: TokenPair) {
  accessToken = tokens.accessToken;
  await storageReady();
  await Promise.all([
    SecureStorage.set("access_token", tokens.accessToken),
    SecureStorage.set("refresh_token", tokens.refreshToken)
  ]);
}

export async function restoreSession(): Promise<boolean> {
  await storageReady();
  const stored = await SecureStorage.get("access_token");
  accessToken = typeof stored === "string" ? stored : null;
  return Boolean(await refreshAccessToken());
}

export async function beginLogin() {
  const id = await deviceId();
  await Browser.open({
    url: `${apiBase}/auth/mobile/google?deviceId=${encodeURIComponent(id)}`,
    presentationStyle: "popover"
  });
}

export function listenForLogin(onResult: (ok: boolean, message?: string) => void) {
  return App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith("studioadmin://oauth/callback")) return;
    await Browser.close().catch(() => undefined);
    const code = new URL(url).searchParams.get("code");
    if (!code) return onResult(false, "קוד ההתחברות חסר");
    try {
      const response = await fetch(`${apiBase}/auth/mobile/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, deviceId: await deviceId() })
      });
      if (!response.ok) throw new Error("login_failed");
      await saveTokens((await response.json()) as TokenPair);
      onResult(true);
    } catch {
      onResult(false, "ההתחברות נכשלה או שהחשבון אינו מנהל");
    }
  });
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    await storageReady();
    const refreshToken = await SecureStorage.get("refresh_token");
    if (typeof refreshToken !== "string" || !refreshToken) return null;
    const response = await fetch(`${apiBase}/auth/mobile/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken, deviceId: await deviceId() })
    });
    if (!response.ok) {
      await clearTokens();
      return null;
    }
    const tokens = (await response.json()) as TokenPair;
    await saveTokens(tokens);
    return tokens.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function authorizedFetch(path: string, init: RequestInit = {}) {
  if (!accessToken) {
    await storageReady();
    const stored = await SecureStorage.get("access_token");
    accessToken = typeof stored === "string" ? stored : null;
  }
  const send = (token: string | null) =>
    fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    });
  let response = await send(accessToken);
  if (response.status === 401 || response.status === 403) {
    response = await send(await refreshAccessToken());
  }
  return response;
}

export async function clearTokens() {
  accessToken = null;
  await storageReady();
  await Promise.all([SecureStorage.remove("access_token"), SecureStorage.remove("refresh_token")]);
}

export async function logout() {
  const id = await deviceId();
  await authorizedFetch("/auth/mobile/logout", {
    method: "POST",
    body: JSON.stringify({ deviceId: id })
  }).catch(() => undefined);
  await clearTokens();
}

export const isNative = Capacitor.isNativePlatform();
