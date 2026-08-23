import { fetch as undiciFetch } from "undici";
import { ProviderError } from "@studio/shared";
import { classifyGeminiError, userFacingGeminiError } from "@studio/shared";

function throwHttpError(url: string, status: number, text: string, retryAfter?: string | null): never {
  const friendly = userFacingGeminiError(text, status);
  const isGemini = url.includes("generativelanguage.googleapis.com") || url.includes("googleapis.com");
  if (isGemini && friendly && classifyGeminiError(text, status) !== "unknown") {
    throw new ProviderError(friendly, {
      provider: "gemini",
      metadata: {
        status,
        raw: text.slice(0, 4000),
        kind: classifyGeminiError(text, status),
        ...(retryAfter ? { retryAfter } : {})
      }
    });
  }
  const lower = text.toLowerCase();
  if (
    lower.includes("content_policy_violation") ||
    lower.includes("copyright") ||
    lower.includes("sensitive content") ||
    lower.includes("partner_validation_failed")
  ) {
    throw new ProviderError(
      "ספק הווידאו חסם את הסצנה בגלל דמות מוכרת / זכויות יוצרים. השתמש בדמויות בדיוניות כלליות (בלי מנהיגים, סלבס או לוגואים), או החלף תמונות השראה.",
      {
        provider: "fal",
        metadata: { status, raw: text.slice(0, 4000), kind: "content_policy_violation", url }
      }
    );
  }
  throw new Error(`HTTP ${status} for ${url}: ${text.slice(0, 800)}`);
}

export async function httpJson<T = unknown>(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 60_000);
  try {
    const response = await undiciFetch(url, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throwHttpError(url, response.status, text, response.headers.get("retry-after"));
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } finally {
    clearTimeout(timeout);
  }
}

export async function httpBytes(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}
): Promise<{ body: Buffer; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 120_000);
  try {
    const response = await undiciFetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body:
        init.body === undefined
          ? undefined
          : typeof init.body === "string"
            ? init.body
            : JSON.stringify(init.body),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} downloading ${url}`);
    }
    const arr = new Uint8Array(await response.arrayBuffer());
    return { body: Buffer.from(arr), mimeType: response.headers.get("content-type") ?? "application/octet-stream" };
  } finally {
    clearTimeout(timeout);
  }
}
