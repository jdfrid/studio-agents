import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";
import { geminiDownloadReference } from "./files.js";
import { geminiModels, geminiUrl } from "./common.js";

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

  const parts: Array<Record<string, unknown>> = [{ text: req.prompt }];
  if (req.referenceImageUrl) {
    const ref = await geminiDownloadReference(provider, req.referenceImageUrl);
    parts.push({ inlineData: { data: ref.body.toString("base64"), mimeType: ref.mimeType } });
  }
  if (req.firstFrameUrl) {
    const first = await geminiDownloadReference(provider, req.firstFrameUrl);
    parts.push({ inlineData: { data: first.body.toString("base64"), mimeType: first.mimeType }, role: "first_frame" });
  }
  if (req.lastFrameUrl) {
    const last = await geminiDownloadReference(provider, req.lastFrameUrl);
    parts.push({ inlineData: { data: last.body.toString("base64"), mimeType: last.mimeType }, role: "last_frame" });
  }

  const queued = await httpJson<{ name?: string; operationName?: string }>(geminiUrl(provider, `models/${model}:generateVideos`), {
    method: "POST",
    body: {
      prompt: req.prompt,
      contents: [{ role: "user", parts }],
      video: req.extendVideoHandle ? { name: req.extendVideoHandle } : undefined,
      config: {
        aspectRatio: req.aspectRatio,
        aspect_ratio: req.aspectRatio,
        durationSeconds: req.durationBucket,
        duration_seconds: req.durationBucket,
        numberOfVideos: 1
      }
    },
    timeoutMs: 120_000
  });

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
    const status = await httpJson<unknown>(geminiUrl(provider, `operations/${operationName}`), { timeoutMs: 30_000 });
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
        const downloaded = await httpBytes(lastStatus.videoUrl, { timeoutMs: 240_000 });
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

function normalizeOperation(operationName: string, model: string, raw: unknown): GeminiVeoOperation {
  const r = raw as {
    done?: boolean;
    error?: { message?: string } | string;
    response?: any;
    result?: any;
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

  const response = r.response ?? r.result ?? {};
  const generated = response.generatedVideos ?? response.generated_videos ?? [];
  const video = generated[0]?.video;
  const listed = response.videos?.[0];
  const data = video?.data;
  return {
    operationName,
    model,
    status: "completed",
    videoUrl: video?.uri ?? listed?.gcsUri ?? listed?.uri,
    videoBytes: data ? Buffer.from(data, "base64") : undefined,
    mimeType: video?.mimeType ?? video?.mime_type ?? listed?.mimeType ?? "video/mp4"
  };
}
