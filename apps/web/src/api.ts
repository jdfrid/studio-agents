const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (!apiBase) return `/api${path}`;
  return `${apiBase}${path}`;
}

async function throwApiError(res: Response): Promise<never> {
  const text = await res.text();
  let message = text;
  let code: string | undefined;
  let details: unknown;
  try {
    const json = JSON.parse(text) as { error?: string; message?: string; code?: string; details?: unknown };
    if (typeof json.message === "string") message = json.message;
    else if (typeof json.error === "string") message = json.error;
    code = json.code;
    details = json.details;
  } catch {
    // keep raw
  }
  const err = new Error(message) as Error & { code?: string; status?: number; details?: unknown };
  err.code = code;
  err.status = res.status;
  err.details = details;
  throw err;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: "include" });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

export async function apiDelete<T = { ok: boolean }>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "DELETE",
    credentials: "include"
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

export function authLoginUrl(): string {
  return apiUrl("/auth/google");
}

export async function uploadStageArtifact(
  runId: string,
  stage: string,
  file: File,
  input: { kind: string; attach: Record<string, unknown> }
): Promise<void> {
  const base64 = await fileToBase64(file);
  await apiPost(`/runs/${runId}/stages/${stage}/artifacts`, {
    kind: input.kind,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    base64,
    attach: input.attach
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

import { formatApiErrorMessage, parseStageError, stageErrorFriendly } from "@studio/shared";

export function isQuotaErrorMessage(message: string): boolean {
  if (message.includes("הגעת למגבלת התקציב")) return true;
  return parseStageError(message).kind === "billing_quota";
}

export { formatApiErrorMessage, stageErrorFriendly };
