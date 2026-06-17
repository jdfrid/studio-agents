import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";

export interface MediaSearchRequest {
  prompt: string;
  preferredKind: "video" | "image";
  aspectRatio?: string;
}

export interface MediaSearchResult {
  provider: string;
  sourceUrl: string;
  kind: "video" | "image";
  mimeType: string;
  body: Buffer;
  width: number | null;
  height: number | null;
}

export async function searchMedia(provider: ProviderCredentialView, req: MediaSearchRequest): Promise<MediaSearchResult> {
  const name = provider.provider.toLowerCase();
  if (name.includes("pexels")) return pexels(provider, req);
  throw new ProviderError(`Unsupported MEDIA_SEARCH provider: ${provider.provider}`, { provider: provider.provider });
}

async function pexels(provider: ProviderCredentialView, req: MediaSearchRequest): Promise<MediaSearchResult> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("Pexels missing API key", { provider: provider.provider });
  if (req.preferredKind === "video") {
    const resp = await httpJson<{ videos: Array<{ width: number; height: number; video_files: Array<{ link: string; file_type: string; width: number; height: number }> }> }>(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(req.prompt)}&per_page=3`,
      { headers: { authorization: apiKey }, timeoutMs: 30_000 }
    );
    const candidate = resp.videos?.[0];
    const file = candidate?.video_files?.find((f) => f.file_type === "video/mp4") ?? candidate?.video_files?.[0];
    if (!file) throw new ProviderError("Pexels returned no video file", { provider: provider.provider });
    const { body, mimeType } = await httpBytes(file.link, { timeoutMs: 120_000 });
    return {
      provider: provider.provider,
      sourceUrl: file.link,
      kind: "video",
      mimeType,
      body,
      width: file.width ?? null,
      height: file.height ?? null
    };
  }
  const resp = await httpJson<{ photos: Array<{ src: { large2x: string; original: string }; width: number; height: number }> }>(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(req.prompt)}&per_page=3`,
    { headers: { authorization: apiKey }, timeoutMs: 30_000 }
  );
  const photo = resp.photos?.[0];
  if (!photo) throw new ProviderError("Pexels returned no image", { provider: provider.provider });
  const src = photo.src.large2x ?? photo.src.original;
  const { body, mimeType } = await httpBytes(src, { timeoutMs: 60_000 });
  return {
    provider: provider.provider,
    sourceUrl: src,
    kind: "image",
    mimeType,
    body,
    width: photo.width ?? null,
    height: photo.height ?? null
  };
}
