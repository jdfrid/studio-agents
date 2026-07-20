import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";
import { geminiDownloadReference } from "./files.js";
import { geminiApiKey, geminiBaseUrl, geminiModels, geminiUrl } from "./common.js";
import { veoGenerateAudio, veoResolution } from "@studio/shared";

export interface GeminiInlineMedia {
  body: Buffer;
  mimeType: string;
}

export interface GeminiVeoRequest {
  sceneId: string;
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  durationBucket: "4" | "6" | "8";
  referenceImageUrl?: string | null;
  referenceImage?: GeminiInlineMedia | null;
  firstFrameUrl?: string | null;
  firstFrame?: GeminiInlineMedia | null;
  lastFrameUrl?: string | null;
  lastFrame?: GeminiInlineMedia | null;
  extendVideoHandle?: string | null;
  /** When false, Veo renders silent video (TTS/mix handled downstream). Default false unless veo_native_audio. */
  generateAudio?: boolean;
}

export interface GeminiVeoOperation {
  operationName: string;
  model: string;
  status: "queued" | "polling" | "completed" | "failed";
  videoUrl?: string;
  videoFileName?: string;
  videoBytes?: Buffer;
  mimeType?: string;
  error?: string;
}

export async function geminiGenerateVeoVideo(
  provider: ProviderCredentialView,
  req: GeminiVeoRequest,
  onPoll?: (operation: GeminiVeoOperation) => Promise<void> | void
): Promise<GeminiVeoOperation> {
  const configuredModel = geminiModels(provider).video;
  if (provider.config.mock === true || process.env.GEMINI_MOCK === "1") {
    return {
      operationName: `mock/operations/${req.sceneId}`,
      model: configuredModel,
      status: "completed",
      videoBytes: Buffer.from(`mock video for ${req.sceneId}`),
      mimeType: "video/mp4"
    };
  }

  const modelsToTry = veoModelFallbackChain(configuredModel);
  let lastError: unknown;
  for (const model of modelsToTry) {
    try {
      return await runVeoGeneration(provider, req, model, onPoll);
    } catch (error) {
      lastError = error;
      if (!isRetriableVeoModelError(error) || model === modelsToTry[modelsToTry.length - 1]) {
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function veoModelFallbackChain(model: string): string[] {
  if (model.includes("lite")) {
    return [model, "veo-3.1-fast-generate-preview"];
  }
  return [model];
}

function isRetriableVeoModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("400") &&
    (message.includes("not supported") ||
      message.includes("INVALID_ARGUMENT") ||
      message.includes("use case is currently not supported"))
  );
}

async function runVeoGeneration(
  provider: ProviderCredentialView,
  req: GeminiVeoRequest,
  model: string,
  onPoll?: (operation: GeminiVeoOperation) => Promise<void> | void
): Promise<GeminiVeoOperation> {
  const instance = await buildVeoInstance(provider, req, model);
  const queued = await httpJson<{ name?: string; operationName?: string }>(
    geminiUrl(provider, `models/${model}:predictLongRunning`),
    {
      method: "POST",
      body: {
        instances: [instance],
        parameters: buildVeoParameters(req, model)
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
      const downloaded = await downloadVeoResult(provider, lastStatus);
      if (downloaded) {
        return { ...lastStatus, videoBytes: downloaded.body, mimeType: downloaded.mimeType };
      }
      throw new ProviderError(
        "Gemini Veo completed without downloadable video data — ייתכן שתוכן נחסם או שהתגובה מה-API השתנתה. נסה rerun או בדוק את gemini_operation.",
        {
          provider: "gemini",
          metadata: {
            model,
            operationName,
            error: lastStatus.error ?? null,
            videoUrl: lastStatus.videoUrl ?? null,
            videoFileName: lastStatus.videoFileName ?? null
          }
        }
      );
    }
  }
  throw new ProviderError(`Gemini Veo timed out after ${Math.round(timeoutMs / 1000)}s`, {
    provider: "gemini",
    metadata: { model, operationName, lastStatus }
  });
}

function buildVeoParameters(req: GeminiVeoRequest, model: string): Record<string, unknown> {
  const params: Record<string, unknown> = {
    aspectRatio: req.aspectRatio,
    durationSeconds: Number(req.durationBucket),
    sampleCount: 1,
    resolution: veoResolution()
  };
  if (!model.includes("lite")) {
    params.generateAudio = req.generateAudio ?? veoGenerateAudio();
  }
  return params;
}

async function buildVeoInstance(
  provider: ProviderCredentialView,
  req: GeminiVeoRequest,
  model: string
): Promise<Record<string, unknown>> {
  const instance: Record<string, unknown> = { prompt: req.prompt };

  if (req.extendVideoHandle) {
    instance.video = { uri: req.extendVideoHandle };
  }

  // Veo Lite: text-to-video only — reference / first / last frames are not supported.
  const includeImages = !model.includes("lite");

  if (includeImages && req.firstFrame) {
    instance.image = {
      bytesBase64Encoded: req.firstFrame.body.toString("base64"),
      mimeType: req.firstFrame.mimeType
    };
  } else if (includeImages && req.firstFrameUrl) {
    const first = await geminiDownloadReference(provider, req.firstFrameUrl);
    instance.image = { bytesBase64Encoded: first.body.toString("base64"), mimeType: first.mimeType };
  } else if (includeImages && req.referenceImage) {
    instance.image = {
      bytesBase64Encoded: req.referenceImage.body.toString("base64"),
      mimeType: req.referenceImage.mimeType
    };
  } else if (includeImages && req.referenceImageUrl) {
    const ref = await geminiDownloadReference(provider, req.referenceImageUrl);
    instance.image = { bytesBase64Encoded: ref.body.toString("base64"), mimeType: ref.mimeType };
  }

  if (includeImages && req.lastFrame) {
    instance.lastFrame = {
      bytesBase64Encoded: req.lastFrame.body.toString("base64"),
      mimeType: req.lastFrame.mimeType
    };
  } else if (includeImages && req.lastFrameUrl) {
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

async function downloadVeoResult(
  provider: ProviderCredentialView,
  operation: GeminiVeoOperation
): Promise<{ body: Buffer; mimeType: string } | null> {
  const attempts: Array<{ uri?: string; fileName?: string }> = [];
  if (operation.videoUrl) attempts.push({ uri: operation.videoUrl });
  if (operation.videoFileName) attempts.push({ fileName: operation.videoFileName });

  for (const attempt of attempts) {
    try {
      return await downloadGeminiVideo(provider, attempt);
    } catch {
      // try next shape / auth mode
    }
  }
  return null;
}

async function downloadGeminiVideo(
  provider: ProviderCredentialView,
  target: { uri?: string; fileName?: string }
): Promise<{ body: Buffer; mimeType: string }> {
  const apiKey = geminiApiKey(provider);
  let url: string;
  if (target.fileName) {
    const name = target.fileName.replace(/^\/+/, "");
    const path = name.startsWith("files/") ? `${name}:download?alt=media` : `files/${name}:download?alt=media`;
    url = geminiUrl(provider, path);
  } else if (target.uri) {
    url = target.uri.startsWith("http://") || target.uri.startsWith("https://")
      ? target.uri
      : resolveGeminiResourceUrl(provider, target.uri);
  } else {
    throw new Error("No Veo download target");
  }

  // Google recommends x-goog-api-key header; also try query key as fallback.
  const urlWithoutKey = url.replace(/([?&])key=[^&]*(&)?/g, (_, sep, tail) => (tail ? sep : "")).replace(/[?&]$/, "");
  try {
    return await httpBytes(urlWithoutKey, {
      headers: { "x-goog-api-key": apiKey },
      timeoutMs: 240_000
    });
  } catch {
    return httpBytes(withApiKey(urlWithoutKey, apiKey), { timeoutMs: 240_000 });
  }
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

  const payload = extractVideoPayload(r.response ?? r.result ?? {});
  if (payload?.blocked) {
    return {
      operationName,
      model,
      status: "failed",
      error: payload.blockedReason ?? "Video blocked by Gemini content policy"
    };
  }
  if (!payload) {
    return {
      operationName,
      model,
      status: "completed",
      error: "No video payload in completed operation"
    };
  }

  return {
    operationName,
    model,
    status: "completed",
    videoUrl: payload.uri,
    videoFileName: payload.fileName,
    videoBytes: payload.data ? Buffer.from(payload.data, "base64") : undefined,
    mimeType: payload.mimeType ?? "video/mp4"
  };
}

type ExtractedVideoPayload = {
  uri?: string;
  fileName?: string;
  data?: string;
  mimeType?: string;
  blocked?: boolean;
  blockedReason?: string;
};

function extractVideoPayload(response: Record<string, unknown>): ExtractedVideoPayload | null {
  const generateVideoResponse = (response.generateVideoResponse ??
    response.generate_video_response ??
    response) as Record<string, unknown>;

  const filteredReasons = (generateVideoResponse.raiMediaFilteredReasons ??
    generateVideoResponse.rai_media_filtered_reasons ??
    []) as string[];
  const generatedSamples = (generateVideoResponse.generatedSamples ??
    generateVideoResponse.generated_samples ??
    []) as Array<Record<string, unknown>>;

  for (const sample of generatedSamples) {
    const fromSample = videoPayloadFromRecord((sample.video ?? sample) as Record<string, unknown>);
    if (fromSample) return fromSample;
  }

  const legacyGenerated = (response.generatedVideos ?? response.generated_videos ?? []) as Array<Record<string, unknown>>;
  for (const item of legacyGenerated) {
    const fromLegacy = videoPayloadFromRecord((item.video ?? item) as Record<string, unknown>);
    if (fromLegacy) return fromLegacy;
  }

  const listed = (response.videos as Array<Record<string, unknown>> | undefined) ?? [];
  for (const item of listed) {
    const fromListed = videoPayloadFromRecord(item);
    if (fromListed) return fromListed;
  }

  if (filteredReasons.length > 0) {
    return { blocked: true, blockedReason: filteredReasons.join(" ") };
  }

  return null;
}

function videoPayloadFromRecord(video: Record<string, unknown> | undefined): ExtractedVideoPayload | null {
  if (!video) return null;
  const uri = (video.uri ?? video.url) as string | undefined;
  const fileName = (video.name ?? video.file) as string | undefined;
  const data = (video.data ?? video.bytesBase64Encoded) as string | undefined;
  const mimeType = (video.mimeType ?? video.mime_type) as string | undefined;
  if (uri) return { uri, mimeType };
  if (fileName) return { fileName: String(fileName), mimeType };
  if (data) return { data: String(data), mimeType };
  return null;
}
