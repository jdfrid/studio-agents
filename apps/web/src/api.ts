import { formatApiErrorMessage } from "@studio/shared";

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (!apiBase) return `/api${path}`;
  return `${apiBase}${path}`;
}

async function throwApiError(res: Response): Promise<never> {
  const text = await res.text();
  let message = text;
  try {
    const json = JSON.parse(text) as { error?: string };
    if (typeof json.error === "string") message = json.error;
  } catch {
    // keep raw body
  }
  throw new Error(formatApiErrorMessage(`${res.status} ${message}`));
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
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

export { formatApiErrorMessage };

export function isQuotaErrorMessage(message: string): boolean {
  return message.includes("הגעת למגבלת התקציב");
}
