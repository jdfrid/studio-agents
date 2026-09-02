import { fetch as undiciFetch, FormData, File } from "undici";
import { ProviderError } from "@studio/shared";

export class SocialApiError extends ProviderError {
  readonly status: number;
  readonly code: string;

  constructor(network: string, message: string, status: number, code: string, raw?: string) {
    super(message, { provider: network, metadata: { status, kind: code, raw: raw?.slice(0, 4000) } });
    this.name = "SocialApiError";
    this.status = status;
    this.code = code;
  }
}

function classify(status: number, text: string): string {
  const lower = text.toLowerCase();
  if (status === 401 || status === 403) return "auth_expired";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "network_rejected";
  if (lower.includes("expired") || lower.includes("invalid token")) return "auth_expired";
  return "upload_failed";
}

export async function socialRequest(
  network: string,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer | Uint8Array | FormData;
    timeoutMs?: number;
  } = {}
): Promise<{ status: number; text: string; headers: { get(name: string): string | null } }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 120_000);
  try {
    const headers = { ...(init.headers ?? {}) };
    let body: string | Buffer | Uint8Array | FormData | undefined = init.body;
    if (body instanceof FormData) {
      delete headers["content-type"];
      delete headers["Content-Type"];
    }
    const response = await undiciFetch(url, {
      method: init.method ?? "GET",
      headers,
      body: body as never,
      signal: controller.signal
    });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers };
  } finally {
    clearTimeout(timeout);
  }
}

export async function socialJson<T = unknown>(
  network: string,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    okStatuses?: number[];
  } = {}
): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const body =
    init.body === undefined || isForm
      ? (init.body as FormData | undefined)
      : typeof init.body === "string"
        ? init.body
        : JSON.stringify(init.body);
  const result = await socialRequest(network, url, {
    method: init.method,
    timeoutMs: init.timeoutMs,
    headers: {
      accept: "application/json",
      ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {})
    },
    body
  });
  const ok = init.okStatuses?.includes(result.status) ?? (result.status >= 200 && result.status < 300);
  if (!ok) {
    throw new SocialApiError(
      network,
      `${network} HTTP ${result.status}: ${result.text.slice(0, 400)}`,
      result.status,
      classify(result.status, result.text),
      result.text
    );
  }
  return result.text ? (JSON.parse(result.text) as T) : (undefined as T);
}

export async function socialFormJson<T = unknown>(
  network: string,
  url: string,
  fields: Record<string, string>,
  init: { method?: string; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<T> {
  const body = new URLSearchParams(fields).toString();
  const result = await socialRequest(network, url, {
    method: init.method ?? "POST",
    timeoutMs: init.timeoutMs,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      ...(init.headers ?? {})
    },
    body
  });
  if (result.status < 200 || result.status >= 300) {
    throw new SocialApiError(
      network,
      `${network} HTTP ${result.status}: ${result.text.slice(0, 400)}`,
      result.status,
      classify(result.status, result.text),
      result.text
    );
  }
  return result.text ? (JSON.parse(result.text) as T) : (undefined as T);
}

export function filePart(body: Buffer, filename: string, mimeType: string): File {
  return new File([new Uint8Array(body)], filename, { type: mimeType });
}

export { FormData };
