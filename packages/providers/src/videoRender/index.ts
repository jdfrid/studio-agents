import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";

export interface SceneRenderRequest {
  sceneId: string;
  order: number;
  durationSeconds: number;
  aspectRatio: string;
  narration: string;
  visualPrompt: string;
  /** Signed URL for background video/image source (already accessible). */
  backgroundUrl: string | null;
  /** Signed URL for narration voice (already accessible). */
  voiceUrl: string | null;
  language: string;
}

export interface SceneRenderResult {
  provider: string;
  body: Buffer;
  mimeType: string;
  durationSeconds: number;
}

export async function renderSceneClipExternal(
  provider: ProviderCredentialView,
  req: SceneRenderRequest
): Promise<SceneRenderResult> {
  const name = provider.provider.toLowerCase();
  if (name.includes("shotstack")) return shotstack(provider, req);
  if (name.includes("xai") || name.includes("grok")) return xaiVideo(provider, req);
  throw new ProviderError(`Unsupported VIDEO provider: ${provider.provider}`, { provider: provider.provider });
}

function aspectToShotstack(aspectRatio: string): "9:16" | "16:9" | "1:1" {
  if (aspectRatio === "9:16" || aspectRatio === "16:9" || aspectRatio === "1:1") return aspectRatio;
  return "9:16";
}

async function shotstack(provider: ProviderCredentialView, req: SceneRenderRequest): Promise<SceneRenderResult> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("Shotstack missing API key", { provider: provider.provider });
  const baseUrl = String(provider.config.baseUrl ?? "https://api.shotstack.io/edit/v1");
  const resolution = String(provider.config.resolution ?? "sd");
  const timeline = {
    background: "#000000",
    tracks: [
      req.backgroundUrl
        ? {
            clips: [
              {
                asset: { type: "video", src: req.backgroundUrl },
                start: 0,
                length: req.durationSeconds,
                fit: "cover"
              }
            ]
          }
        : undefined,
      req.voiceUrl
        ? {
            clips: [
              {
                asset: { type: "audio", src: req.voiceUrl },
                start: 0,
                length: req.durationSeconds
              }
            ]
          }
        : undefined
    ].filter(Boolean)
  };
  const queue = await httpJson<{ success: boolean; response: { id: string; message?: string } }>(
    `${baseUrl}/render`,
    {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: { timeline, output: { format: "mp4", resolution, aspectRatio: aspectToShotstack(req.aspectRatio) } },
      timeoutMs: 60_000
    }
  );
  if (!queue.success || !queue.response?.id) {
    throw new ProviderError(`Shotstack queue failed: ${queue.response?.message ?? "unknown"}`, { provider: provider.provider });
  }
  const renderId = queue.response.id;
  const startedAt = Date.now();
  const timeoutMs = Number(provider.config.timeoutSeconds ?? 240) * 1000;
  let lastStatus = "submitted";
  let outputUrl: string | undefined;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const status = await httpJson<{ response: { status: string; url?: string; error?: string } }>(
      `${baseUrl}/render/${renderId}`,
      { headers: { "x-api-key": apiKey }, timeoutMs: 30_000 }
    );
    lastStatus = status.response.status;
    if (lastStatus === "done") {
      outputUrl = status.response.url;
      break;
    }
    if (lastStatus === "failed") {
      throw new ProviderError(`Shotstack render failed: ${status.response.error ?? "unknown"}`, { provider: provider.provider });
    }
  }
  if (!outputUrl) {
    throw new ProviderError(`Shotstack render timed out (last status: ${lastStatus})`, { provider: provider.provider });
  }
  const { body, mimeType } = await httpBytes(outputUrl, { timeoutMs: 120_000 });
  return { provider: provider.provider, body, mimeType, durationSeconds: req.durationSeconds };
}

async function xaiVideo(provider: ProviderCredentialView, req: SceneRenderRequest): Promise<SceneRenderResult> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("xAI video missing API key", { provider: provider.provider });
  const baseUrl = String(provider.config.baseUrl ?? "https://api.x.ai");
  const model = String(provider.config.model ?? "grok-imagine-video");
  const duration = Math.min(15, Math.max(1, Math.round(req.durationSeconds)));
  const queue = await httpJson<{ request_id?: string; id?: string }>(`${baseUrl}/v1/videos/generations`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: {
      model,
      prompt: `${req.visualPrompt}\n\nScene narration (for tone reference): ${req.narration}`,
      duration_seconds: duration,
      aspect_ratio: req.aspectRatio,
      image: req.backgroundUrl ?? undefined
    },
    timeoutMs: 60_000
  });
  const requestId = queue.request_id ?? queue.id;
  if (!requestId) throw new ProviderError("xAI did not return a request id", { provider: provider.provider });
  const startedAt = Date.now();
  const timeoutMs = Number(provider.config.timeoutSeconds ?? 900) * 1000;
  let outputUrl: string | undefined;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const status = await httpJson<{ status?: string; output_url?: string; url?: string; error?: string }>(
      `${baseUrl}/v1/videos/${requestId}`,
      { headers: { authorization: `Bearer ${apiKey}` }, timeoutMs: 30_000 }
    );
    if (status.status === "completed" || status.output_url || status.url) {
      outputUrl = status.output_url ?? status.url;
      break;
    }
    if (status.status === "failed") {
      throw new ProviderError(`xAI render failed: ${status.error ?? "unknown"}`, { provider: provider.provider });
    }
  }
  if (!outputUrl) throw new ProviderError("xAI render timed out", { provider: provider.provider });
  const { body, mimeType } = await httpBytes(outputUrl, { timeoutMs: 180_000 });
  return { provider: provider.provider, body, mimeType, durationSeconds: duration };
}
