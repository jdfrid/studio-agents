import type { ProviderCredentialView } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";
import { gcsClient, gcsPathFromStorageUrl } from "../gcs.js";
import { geminiUrl } from "./common.js";

export interface GeminiFileRef {
  name: string;
  uri: string;
  mimeType: string;
}

/**
 * Minimal Files API helper. For URLs that are already public/signed, most Gemini/Veo
 * calls can consume the bytes directly, so this function currently downloads and
 * returns bytes for callers that need inline image input.
 */
export async function geminiDownloadReference(
  _provider: ProviderCredentialView,
  url: string
): Promise<{ body: Buffer; mimeType: string }> {
  const gcsPath = gcsPathFromStorageUrl(url);
  if (gcsPath) {
    try {
      return await gcsClient().download(gcsPath);
    } catch {
      // fall through to signed URL fetch
    }
  }
  return httpBytes(url, { timeoutMs: 180_000 });
}

export async function geminiGetOperation(provider: ProviderCredentialView, operationName: string): Promise<unknown> {
  return httpJson<unknown>(geminiUrl(provider, `operations/${encodeURIComponent(operationName)}`), {
    timeoutMs: 30_000
  });
}
