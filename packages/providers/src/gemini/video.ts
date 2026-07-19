import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";
import { geminiDownloadReference } from "./files.js";
import { geminiApiKey, geminiBaseUrl, geminiModels, geminiUrl } from "./common.js";
import { veoGenerateAudio, veoResolution } from "@studio/shared";

export interface GeminiVeoRequest {
  sceneId: string;
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  durationBucket: "4" | "6" | "8";
  referenceImageUrl?: string | null;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  extendVideoHandle?: string | null;
}

export interface GeminiVeoOperation {
  operationName: string;
  model: string;
  status: "queued" | "polling" | "completed" | "failed";
  videoUrl?: string;
  videoBytes?: Buffer;
  mimeType?: string;
  error?: string;
}

export async function geminiGenerateVeoVideo(
  provider: ProviderCredentialView,
  req: GeminiVeoRequest,
  onPoll?: (operation: GeminiVeoOperation) => Promise<void> | void
): Promise<GeminiVeoOperation> {
  const model = geminiModels(provider).video;
  if (provider.config.mock === true || process.env.GEMINI_MOCK === "1") {
    return {
      operationName: `mock/operations/${req.sceneId}`,
      model,
      status: "completed",
      videoBytes: Buffer.from(`mock video for ${req.sceneId}`),
      mimeType: "video/mp4"
    };
  }

  const instance = await buildVeoInstance(provider, req);
  const queued = await httpJson<{ name?: string; operationName?: string }>(
    geminiUrl(provider, `models/${model}:predictLongRunning`),
    {
      method: "POST",
      body: {
        instances: [instance],
        parameters: {
          aspectRatio: req.aspectRatio,
          durationSeconds: Number(req.durationBucket),
          sampleCount: 1,
          resolution: veoResolution()
        }
      },
      timeoutMs: 120_000
    }
  );

  const operationName = queued.name ?? queued.operationName;
  if (!operationName) {
    throw new ProviderError("Gemini Veo did not return an operation name", { provider: "gemini", metadata: { model } });
  }

  await onPoll?.({ operationName, model, status: "queued" });
  const timeoutMs = Number(provider.config.videoTimeoutSeconds ?? 900) * 1000;
  const startedAt = Date.now();
  let lastStatus: GeminiVeoOperation = { operationName, model, status: "polling" };
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, Number(provider.config.videoPollIntervalMs ?? 8000)));
    const status = await httpJson<unknown>(operationPollUrl(provider, operationName), { timeoutMs: 30_000 });
    lastStatus = normalizeOperation(operationName, model, status);
    await onPoll?.(lastStatus);
    if (lastStatus.status === "failed") {
      throw new ProviderError(`Gemini Veo operation failed: ${lastStatus.error ?? "unknown"}`, {
        provider: "gemini",
        metadata: { model, operationName }
      });
    }
    if (lastStatus.status === "completed") {
      if (lastStatus.videoBytes) return lastStatus;
      if (lastStatus.videoUrl) {
        const downloaded = await downloadGeminiVideo(provider, lastStatus.videoUrl);
        return { ...lastStatus, videoBytes: downloaded.body, mimeType: downloaded.mimeType };
      }
      throw new ProviderError("Gemini Veo completed without downloadable video data", {
        provider: "gemini",
        metadata: { model, operationName }
      });
    }
  }
  throw new ProviderError(`Gemini Veo timed out after ${Math.round(timeoutMs / 1000)}s`, {
    provider: "gemini",
    metadata: { model, operationName, lastStatus }
  });
}

async function buildVeoInstance(provider: ProviderCredentialView, req: GeminiVeoRequest): Promise<Record<string, unknown>> {
  const instance: Record<string, unknown> = { prompt: req.prompt };

  if (req.extendVideoHandle) {
    instance.video = { uri: req.extendVideoHandle };
  }

  if (req.firstFrameUrl) {
    const first = await geminiDownloadReference(provider, req.firstFrameUrl);
    instance.image = { bytesBase64Encoded: first.body.toString("base64"), mimeType: first.mimeType };
  } else if (req.referenceImageUrl) {
    const ref = await geminiDownloadReference(provider, req.referenceImageUrl);
    instance.image = { bytesBase64Encoded: ref.body.toString("base64"), mimeType: ref.mimeType };
  }

  if (req.lastFrameUrl) {
    const last = await geminiDownloadReference(provider, req.lastFrameUrl);
    instance.lastFrame = { bytesBase64Encoded: last.body.toString("base64"), mimeType: last.mimeType };
  }

  return instance;
}

function operationPollUrl(provider: ProviderCredentialView, operationName: string): string {
  const normalized = operationName.replace(/^\/+/, "");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return withApiKey(normalized, geminiApiKey(provider));
  }
  return geminiUrl(provider, normalized);
}

function withApiKey(url: string, apiKey: string): string {
  if (url.includes("key=")) return url;
  const encoded = encodeURIComponent(apiKey);
  return `${url}${url.includes("?") ? "&" : "?"}key=${encoded}`;
}

function resolveGeminiResourceUrl(provider: ProviderCredentialView, uri: string): string {
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return withApiKey(uri, geminiApiKey(provider));
  }
  const base = geminiBaseUrl(provider).replace(/\/+$/, "");
  return withApiKey(`${base}/${uri.replace(/^\/+/, "")}`, geminiApiKey(provider));
}

async function downloadGeminiVideo(
  provider: ProviderCredentialView,
  uri: string
): Promise<{ body: Buffer; mimeType: string }> {
  return httpBytes(resolveGeminiResourceUrl(provider, uri), { timeoutMs: 240_000 });
}

export function normalizeOperation(operationName: string, model: string, raw: unknown): GeminiVeoOperation {
  const r = raw as {
    done?: boolean;
    error?: { message?: string } | string;
    response?: Record<string, unknown>;
    result?: Record<string, unknown>;
  };
  if (r.error) {
    return {
      operationName,
      model,
      status: "failed",
      error: typeof r.error === "string" ? r.error : (r.error.message ?? "unknown error")
    };
  }
  if (!r.done) return { operationName, model, status: "polling" };

  const response = (r.response ?? r.result ?? {}) as Record<string, unknown>;
  const generateVideoResponse = (response.generateVideoResponse ??
    response.generate_video_response ??
    response) as Record<string, unknown>;
  const generatedSamples = (generateVideoResponse.generatedSamples ??
    generateVideoResponse.generated_samples ??
    []) as Array<Record<string, unknown>>;
  const sample = generatedSamples[0];
  const video = (sample?.video ?? sample) as Record<string, unknown> | undefined;

  const legacyGenerated = (response.generatedVideos ?? response.generated_videos ?? []) as Array<Record<string, unknown>>;
  const legacyVideo = legacyGenerated[0]?.video as Record<string, unknown> | undefined;
  const listed = (response.videos as Array<Record<string, unknown>> | undefined)?.[0];
  const resolvedVideo = video ?? legacyVideo ?? listed;
  const data = resolvedVideo?.data as string | undefined;

  return {
    operationName,
    model,
    status: "completed",
    videoUrl: (resolvedVideo?.uri ?? resolvedVideo?.gcsUri ?? listed?.gcsUri ?? listed?.uri) as string | undefined,
    videoBytes: data ? Buffer.from(data, "base64") : undefined,
    mimeType: (resolvedVideo?.mimeType ?? resolvedVideo?.mime_type ?? listed?.mimeType ?? "video/mp4") as string
  };
}
