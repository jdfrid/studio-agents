import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { fetch as undiciFetch, FormData as UndiciFormData, File as UndiciFile } from "undici";
import { httpBytes, httpJson } from "../http.js";
import type { VideoBeatGenerator, VideoBeatHooks, VideoBeatRequest, VideoBeatResult } from "./types.js";

const DEFAULT_BASE = "https://api.heygen.com";
const MODEL_ID = "heygen/v3/videos/image";

function resolveHeygenBaseUrl(credential: ProviderCredentialView): string {
  const raw = String(credential.config.baseUrl ?? process.env.HEYGEN_API_BASE ?? "").trim();
  const base = raw || DEFAULT_BASE;
  return base.replace(/\/$/, "");
}

type HeygenCreateResponse = {
  data?: { video_id?: string; status?: string };
  error?: { message?: string; code?: string };
};

type HeygenStatusResponse = {
  data?: {
    id?: string;
    status?: string;
    video_url?: string | null;
    failure_message?: string | null;
    failure_code?: string | null;
    duration?: number | null;
  };
  error?: { message?: string; code?: string };
};

type HeygenUploadResponse = {
  data?: { asset_id?: string; id?: string; url?: string };
  error?: { message?: string; code?: string };
};

function heygenHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey, "Content-Type": "application/json" };
}

function extForMime(mimeType: string, fallback: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4")) return "mp4";
  return fallback;
}

async function uploadAsset(
  baseUrl: string,
  apiKey: string,
  body: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const form = new UndiciFormData();
  form.append("file", new UndiciFile([body], filename, { type: mimeType }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await undiciFetch(`${baseUrl}/v3/assets`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ProviderError(`HeyGen asset upload failed: HTTP ${response.status} ${text.slice(0, 400)}`, {
        provider: "heygen",
        metadata: { status: response.status }
      });
    }
    const json = text ? (JSON.parse(text) as HeygenUploadResponse) : {};
    const assetId = json.data?.asset_id ?? json.data?.id;
    if (!assetId) {
      throw new ProviderError("HeyGen asset upload returned no asset_id", {
        provider: "heygen",
        metadata: { response: json }
      });
    }
    return assetId;
  } finally {
    clearTimeout(timeout);
  }
}

export function createHeygenBeatGenerator(
  profile: RenderProfile,
  credential: ProviderCredentialView
): VideoBeatGenerator {
  return {
    profile,
    async generateBeat(req: VideoBeatRequest, hooks?: VideoBeatHooks): Promise<VideoBeatResult> {
      const wallStarted = Date.now();
      const operationName = `heygen/${req.sceneId}/${Date.now()}`;

      if (credential.config.mock === true || process.env.HEYGEN_MOCK === "1") {
        await hooks?.onUsage?.({
          activityType: "veo_video",
          sceneId: req.sceneId,
          model: MODEL_ID,
          durationMs: 0,
          billedUnits: req.durationSeconds,
          unit: "veo_seconds",
          charged: "yes",
          metadata: { provider: "heygen", mock: true }
        });
        return {
          provider: "heygen",
          model: MODEL_ID,
          operationName,
          status: "completed",
          videoBytes: Buffer.from(`mock heygen video for ${req.sceneId}`),
          mimeType: "video/mp4"
        };
      }

      const apiKey = credential.secret ?? process.env.HEYGEN_API_KEY;
      if (!apiKey) {
        throw new ProviderError("HeyGen missing API key (HEYGEN_API_KEY)", { provider: "heygen" });
      }
      if (!req.referenceImage) {
        throw new ProviderError("HeyGen requires a reference image per beat", {
          provider: "heygen",
          metadata: { sceneId: req.sceneId }
        });
      }

      const baseUrl = resolveHeygenBaseUrl(credential);
      const voiceId = String(credential.config.voiceId ?? process.env.HEYGEN_VOICE_ID ?? "").trim() || null;

      await hooks?.onPoll?.({ operationName, model: MODEL_ID, status: "queued" });

      const imageAssetId = await uploadAsset(
        baseUrl,
        apiKey,
        req.referenceImage.body,
        req.referenceImage.mimeType,
        `scene-${req.sceneId}.${extForMime(req.referenceImage.mimeType, "jpg")}`
      );

      // type:image lip-syncs to audio/script. Avatar IV may accept motion_prompt on image;
      // omit expressiveness (photo-avatar-only on some engines) to avoid validation errors.
      const createBody: Record<string, unknown> = {
        type: "image",
        title: `scene-${req.sceneId}`,
        aspect_ratio: req.aspectRatio === "16:9" ? "16:9" : "9:16",
        resolution: "1080p",
        image: { type: "asset_id", asset_id: imageAssetId },
        ...(req.prompt?.trim() ? { motion_prompt: req.prompt.trim().slice(0, 400) } : {})
      };

      if (req.voiceAudio?.body?.length) {
        const audioAssetId = await uploadAsset(
          baseUrl,
          apiKey,
          req.voiceAudio.body,
          req.voiceAudio.mimeType || "audio/mpeg",
          `voice-${req.sceneId}.${extForMime(req.voiceAudio.mimeType || "audio/mpeg", "mp3")}`
        );
        createBody.audio_asset_id = audioAssetId;
      } else if (req.narrationText?.trim()) {
        if (!voiceId) {
          throw new ProviderError(
            "HeyGen needs voice audio from TTS, or HEYGEN_VOICE_ID when using script text",
            { provider: "heygen", metadata: { sceneId: req.sceneId } }
          );
        }
        createBody.script = req.narrationText.trim();
        createBody.voice_id = voiceId;
      } else {
        throw new ProviderError("HeyGen lip-sync requires scene voice audio or narration + HEYGEN_VOICE_ID", {
          provider: "heygen",
          metadata: { sceneId: req.sceneId }
        });
      }

      const created = await httpJson<HeygenCreateResponse>(`${baseUrl}/v3/videos`, {
        method: "POST",
        headers: heygenHeaders(apiKey),
        body: createBody,
        timeoutMs: 120_000
      });

      const videoId = created.data?.video_id;
      if (!videoId) {
        throw new ProviderError(`HeyGen create failed: ${created.error?.message ?? "no video_id"}`, {
          provider: "heygen",
          metadata: { created }
        });
      }

      await hooks?.onPoll?.({ operationName: videoId, model: MODEL_ID, status: "polling" });

      const timeoutMs = Number(credential.config.videoTimeoutSeconds ?? process.env.HEYGEN_TIMEOUT_SECONDS ?? 900) * 1000;
      const pollMs = Number(credential.config.videoPollIntervalMs ?? process.env.HEYGEN_POLL_MS ?? 8000);
      const startedAt = Date.now();
      let lastStatus = created.data?.status ?? "pending";

      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const statusPayload = await httpJson<HeygenStatusResponse>(`${baseUrl}/v3/videos/${videoId}`, {
          headers: heygenHeaders(apiKey),
          timeoutMs: 30_000
        });
        const data = statusPayload.data;
        lastStatus = data?.status ?? lastStatus;
        await hooks?.onPoll?.({
          operationName: videoId,
          model: MODEL_ID,
          status: lastStatus.toLowerCase(),
          error: data?.failure_message ?? statusPayload.error?.message ?? null
        });

        if (lastStatus === "failed") {
          throw new ProviderError(
            `HeyGen generation failed: ${data?.failure_message ?? data?.failure_code ?? "unknown"}`,
            { provider: "heygen", metadata: { videoId, failure: data } }
          );
        }

        if (lastStatus === "completed") {
          const videoUrl = data?.video_url;
          if (!videoUrl) {
            throw new ProviderError("HeyGen completed without video_url", {
              provider: "heygen",
              metadata: { videoId }
            });
          }
          const downloaded = await httpBytes(videoUrl, { timeoutMs: 240_000 });
          const billed = Math.max(1, Math.round(data?.duration ?? req.durationSeconds));
          await hooks?.onUsage?.({
            activityType: "veo_video",
            sceneId: req.sceneId,
            model: MODEL_ID,
            durationMs: Date.now() - wallStarted,
            billedUnits: billed,
            unit: "veo_seconds",
            charged: "yes",
            metadata: { provider: "heygen", videoId }
          });
          return {
            provider: "heygen",
            model: MODEL_ID,
            operationName: videoId,
            status: "completed",
            videoBytes: downloaded.body,
            mimeType: downloaded.mimeType.includes("mp4") ? "video/mp4" : downloaded.mimeType
          };
        }
      }

      throw new ProviderError(`HeyGen timed out after ${timeoutMs}ms (last status: ${lastStatus})`, {
        provider: "heygen",
        metadata: { videoId, lastStatus }
      });
    }
  };
}
