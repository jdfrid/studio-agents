import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";

export interface MusicSearchRequest {
  prompt: string;
  durationSeconds?: number;
}

export interface MusicSearchResult {
  provider: string;
  sourceUrl: string;
  mimeType: string;
  body: Buffer;
}

export async function fetchMusic(provider: ProviderCredentialView, req: MusicSearchRequest): Promise<MusicSearchResult> {
  const name = provider.provider.toLowerCase();
  if (name.includes("freesound")) return freesoundFetch(provider, req);
  throw new ProviderError(`Unsupported MUSIC provider: ${provider.provider}`, { provider: provider.provider });
}

async function freesoundFetch(provider: ProviderCredentialView, req: MusicSearchRequest): Promise<MusicSearchResult> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("Freesound missing API key", { provider: provider.provider });
  const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(req.prompt)}&page_size=1&token=${encodeURIComponent(apiKey)}`;
  const resp = await httpJson<{ results: Array<{ previews?: { "preview-hq-mp3"?: string } }> }>(url, { timeoutMs: 30_000 });
  const previewUrl = resp.results?.[0]?.previews?.["preview-hq-mp3"];
  if (!previewUrl) throw new ProviderError("Freesound returned no preview", { provider: provider.provider });
  const { body, mimeType } = await httpBytes(previewUrl, { timeoutMs: 60_000 });
  return { provider: provider.provider, sourceUrl: previewUrl, body, mimeType };
}
