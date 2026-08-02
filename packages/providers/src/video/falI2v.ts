import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";
import type { VideoBeatGenerator, VideoBeatHooks, VideoBeatRequest, VideoBeatResult } from "./types.js";

function resolveFalModel(profile: RenderProfile): string {
  if (profile.falModel) return profile.falModel;
  if (profile.provider === "kling") return "fal-ai/kling-video/v2.1/standard/image-to-video";
  throw new ProviderError(`fal model missing for profile ${profile.id}`, { provider: profile.provider });
}

/** fal MiniMax Hailuo accepts only string enums "6" | "10". Kling uses "5" | "10". */
function durationForModel(profile: RenderProfile, seconds: number): string | number {
  if (profile.id === "hailuo-i2v") {
    return seconds >= 9 ? "10" : "6";
  }
  if (profile.id === "wan-i2v") {
    return Math.min(5, Math.max(3, Math.round(seconds) || 5));
  }
  return seconds >= 10 ? "10" : "5";
}

function buildFalBody(
  profile: RenderProfile,
  req: VideoBeatRequest,
  imageUrl: string,
  duration: string | number
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: req.prompt,
    image_url: imageUrl,
    duration
  };

  // Hailuo schema rejects unknown fields / uses different duration enums; omit aspect_ratio.
  if (profile.id !== "hailuo-i2v") {
    body.aspect_ratio = req.aspectRatio === "16:9" ? "16:9" : "9:16";
  }

  if (profile.id === "hailuo-i2v") {
    body.prompt_optimizer = true;
  }

  return body;
}

export function createFalI2vBeatGenerator(profile: RenderProfile, credential: ProviderCredentialView): VideoBeatGenerator {
  const model = resolveFalModel(profile);
  const providerTag = profile.provider;

  return {
    profile,
    async generateBeat(req: VideoBeatRequest, hooks?: VideoBeatHooks): Promise<VideoBeatResult> {
      const wallStarted = Date.now();
      const operationName = `${providerTag}/${req.sceneId}/${Date.now()}`;

      if (credential.config.mock === true || process.env.KLING_MOCK === "1" || process.env.FAL_MOCK === "1") {
        await hooks?.onUsage?.({
          activityType: "veo_video",
          sceneId: req.sceneId,
          model,
          durationMs: 0,
          billedUnits: req.durationSeconds,
          unit: "veo_seconds",
          charged: "yes",
          metadata: { provider: providerTag, mock: true }
        });
        return {
          provider: providerTag,
          model,
          operationName,
          status: "completed",
          videoBytes: Buffer.from(`mock ${providerTag} video for ${req.sceneId}`),
          mimeType: "video/mp4"
        };
      }

      const apiKey = credential.secret ?? process.env.FAL_API_KEY;
      if (!apiKey) {
        throw new ProviderError(`${providerTag}/fal.ai missing API key (FAL_API_KEY)`, { provider: providerTag });
      }
      if (!req.referenceImage) {
        throw new ProviderError(`${profile.label} requires a reference image per beat`, {
          provider: providerTag,
          metadata: { sceneId: req.sceneId }
        });
      }

      await hooks?.onPoll?.({ operationName, model, status: "queued" });

      const imageUrl = `data:${req.referenceImage.mimeType};base64,${req.referenceImage.body.toString("base64")}`;
      const duration = durationForModel(profile, req.durationSeconds);
      const baseUrl = String(credential.config.baseUrl ?? "https://queue.fal.run");
      const body = buildFalBody(profile, req, imageUrl, duration);

      const queued = await httpJson<{ request_id?: string; status_url?: string; response_url?: string }>(
        `${baseUrl}/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Key ${apiKey}` },
          body,
          timeoutMs: 120_000
        }
      );

      const requestId = queued.request_id;
      if (!requestId) {
        throw new ProviderError(`fal.ai ${providerTag} did not return request_id`, {
          provider: providerTag,
          metadata: { queued, model }
        });
      }

      const statusUrl = queued.status_url ?? `${baseUrl}/${model}/requests/${requestId}/status`;
      const responseUrl = queued.response_url ?? `${baseUrl}/${model}/requests/${requestId}`;

      await hooks?.onPoll?.({ operationName: requestId, model, status: "polling" });

      const timeoutMs = Number(credential.config.videoTimeoutSeconds ?? 900) * 1000;
      const startedAt = Date.now();
      let lastStatus = "IN_QUEUE";

      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, Number(credential.config.videoPollIntervalMs ?? 8000)));
        const status = await httpJson<{ status?: string; error?: string }>(statusUrl, {
          headers: { Authorization: `Key ${apiKey}` },
          timeoutMs: 30_000
        });
        lastStatus = status.status ?? lastStatus;
        await hooks?.onPoll?.({
          operationName: requestId,
          model,
          status: lastStatus.toLowerCase(),
          error: status.error ?? null
        });

        if (lastStatus === "FAILED") {
          throw new ProviderError(`${providerTag} generation failed: ${status.error ?? "unknown"}`, {
            provider: providerTag,
            metadata: { requestId, model }
          });
        }

        if (lastStatus === "COMPLETED") {
          const payload = await httpJson<{ video?: { url?: string }; data?: { video?: { url?: string } } }>(
            responseUrl,
            {
              headers: { Authorization: `Key ${apiKey}` },
              timeoutMs: 60_000
            }
          );
          const videoUrl = payload.video?.url ?? payload.data?.video?.url;
          if (!videoUrl) {
            throw new ProviderError(`${providerTag} completed without video URL`, {
              provider: providerTag,
              metadata: { requestId, model }
            });
          }
          const downloaded = await httpBytes(videoUrl, { timeoutMs: 240_000 });
          const durationMs = Date.now() - wallStarted;
          const billed = typeof duration === "string" ? Number(duration) : duration;
          await hooks?.onUsage?.({
            activityType: "veo_video",
            sceneId: req.sceneId,
            model,
            durationMs,
            billedUnits: billed,
            unit: "veo_seconds",
            charged: "yes",
            metadata: { provider: providerTag, requestId }
          });
          return {
            provider: providerTag,
            model,
            operationName: requestId,
            status: "completed",
            videoBytes: downloaded.body,
            mimeType: downloaded.mimeType ?? "video/mp4"
          };
        }
      }

      throw new ProviderError(`${providerTag} timed out after ${Math.round(timeoutMs / 1000)}s (last: ${lastStatus})`, {
        provider: providerTag,
        metadata: { requestId, model }
      });
    }
  };
}
