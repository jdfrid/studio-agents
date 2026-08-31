import type { ProviderCredentialView } from "@studio/shared";
import { AgentError, ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import {
  DEFAULT_GEMINI_VIDEO_MODEL,
  GEMINI_VIDEO_FALLBACK_MODEL,
  geminiModels,
  geminiUrl,
  isGeminiOmniModelId
} from "./common.js";
import type { GeminiInlineMedia, GeminiVeoHooks, GeminiVeoOperation, GeminiVeoRequest } from "./video.js";
import { geminiGenerateVeoVideo } from "./video.js";

type OmniContent = {
  type?: string;
  data?: string;
  uri?: string;
  mime_type?: string;
  mimeType?: string;
};

export type GeminiOmniInteraction = {
  id?: string;
  status?: string;
  model?: string;
  steps?: Array<{ type?: string; content?: OmniContent[] }>;
  output_video?: OmniContent;
  outputVideo?: OmniContent;
  error?: { message?: string } | string;
};

/**
 * Generate through the Interactions API. Unsupported/unavailable Preview access
 * falls back to Veo Fast without changing explicit legacy Veo profiles.
 */
export async function geminiGenerateOmniVideo(
  provider: ProviderCredentialView,
  req: GeminiVeoRequest,
  hooks: GeminiVeoHooks = {}
): Promise<GeminiVeoOperation> {
  const configured = geminiModels(provider).video;
  const model = isGeminiOmniModelId(configured) ? configured : DEFAULT_GEMINI_VIDEO_MODEL;

  if (provider.config.mock === true || process.env.GEMINI_MOCK === "1") {
    await reportOmniUsage(hooks, req, model, 0);
    return {
      operationName: `mock/interactions/${req.sceneId}`,
      model,
      status: "completed",
      videoBytes: Buffer.from(`mock omni video for ${req.sceneId}`),
      mimeType: "video/mp4"
    };
  }

  const startedAt = Date.now();
  try {
    const interaction = await httpJson<GeminiOmniInteraction>(geminiUrl(provider, "interactions"), {
      method: "POST",
      body: buildOmniRequest(req, model),
      timeoutMs: Number(provider.config.videoTimeoutSeconds ?? 900) * 1000
    });
    const result = normalizeOmniInteraction(interaction, model);
    await hooks.onPoll?.(result);
    if (result.status !== "completed" || !result.videoBytes) {
      throw new ProviderError(`Gemini Omni interaction failed: ${result.error ?? "no video payload"}`, {
        provider: "gemini",
        metadata: { model, interactionId: result.operationName }
      });
    }
    await reportOmniUsage(hooks, req, result.model, Date.now() - startedAt, result.operationName);
    return result;
  } catch (error) {
    if (!isOmniFallbackError(error)) throw error;
    await hooks.onPoll?.({
      operationName: `fallback:${req.sceneId}`,
      model,
      status: "failed",
      error: `Omni unavailable or unsupported; falling back to ${GEMINI_VIDEO_FALLBACK_MODEL}`
    });
    return geminiGenerateVeoVideo(provider, { ...req, modelOverride: GEMINI_VIDEO_FALLBACK_MODEL }, hooks);
  }
}

export function buildOmniRequest(req: GeminiVeoRequest, model: string): Record<string, unknown> {
  const image = req.referenceImage ?? req.firstFrame ?? null;
  const input = image ? [inlineImage(image), { type: "text", text: req.prompt }] : req.prompt;
  return {
    model,
    input,
    response_format: {
      type: "video",
      aspect_ratio: req.aspectRatio
    },
    ...(image
      ? {
          generation_config: {
            video_config: { task: "image_to_video" }
          }
        }
      : {}),
    background: false,
    store: false,
    stream: false
  };
}

function inlineImage(image: GeminiInlineMedia): Record<string, string> {
  return {
    type: "image",
    data: image.body.toString("base64"),
    mime_type: image.mimeType
  };
}

export function normalizeOmniInteraction(
  raw: GeminiOmniInteraction,
  requestedModel: string
): GeminiVeoOperation {
  const operationName = raw.id ?? `interaction:${Date.now()}`;
  const model = raw.model ?? requestedModel;
  if (raw.error) {
    return {
      operationName,
      model,
      status: "failed",
      error: typeof raw.error === "string" ? raw.error : (raw.error.message ?? "unknown error")
    };
  }

  const direct = raw.output_video ?? raw.outputVideo;
  const content =
    direct ??
    raw.steps
      ?.filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .find((part) => part.type === "video");
  const mimeType = content?.mime_type ?? content?.mimeType ?? "video/mp4";
  if (content?.data) {
    return {
      operationName,
      model,
      status: "completed",
      videoBytes: Buffer.from(content.data, "base64"),
      mimeType
    };
  }
  if (content?.uri) {
    return {
      operationName,
      model,
      status: "completed",
      videoUrl: content.uri,
      mimeType,
      error: "URI delivery is not enabled by this adapter"
    };
  }
  return {
    operationName,
    model,
    status: raw.status === "failed" ? "failed" : "completed",
    error: `No inline video in Omni interaction (status=${raw.status ?? "unknown"})`
  };
}

export function isOmniFallbackError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const status =
    error instanceof AgentError && typeof error.metadata?.status === "number"
      ? error.metadata.status
      : undefined;
  return (
    status === 404 ||
    status === 501 ||
    status === 503 ||
    /\bhttp (404|501|503)\b/.test(message) ||
    message.includes("not supported") ||
    message.includes("unsupported") ||
    message.includes("not found") ||
    message.includes("unavailable")
  );
}

async function reportOmniUsage(
  hooks: GeminiVeoHooks,
  req: GeminiVeoRequest,
  model: string,
  durationMs: number,
  interactionId?: string
): Promise<void> {
  await hooks.onUsage?.({
    activityType: "veo_video",
    sceneId: req.sceneId,
    model,
    durationMs: durationMs > 0 ? durationMs : null,
    billedUnits: req.durationSeconds ?? Number(req.durationBucket),
    unit: "veo_seconds",
    generateAudio: false,
    charged: "yes",
    pricingSource: "request_params",
    metadata: {
      api: "interactions",
      ...(interactionId ? { interactionId } : {})
    }
  });
}
