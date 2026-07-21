import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes, httpJson } from "../http.js";
import type { VideoBeatGenerator, VideoBeatHooks, VideoBeatRequest, VideoBeatResult } from "./types.js";

const KLING_MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";

export function createKlingBeatGenerator(profile: RenderProfile, credential: ProviderCredentialView): VideoBeatGenerator {
  return {
    profile,
    async generateBeat(req: VideoBeatRequest, hooks?: VideoBeatHooks): Promise<VideoBeatResult> {
      const wallStarted = Date.now();
      const operationName = `kling/${req.sceneId}/${Date.now()}`;

      if (credential.config.mock === true || process.env.KLING_MOCK === "1" || process.env.FAL_MOCK === "1") {
        await hooks?.onUsage?.({
          activityType: "veo_video",
          sceneId: req.sceneId,
          model: KLING_MODEL,
          durationMs: 0,
          billedUnits: req.durationSeconds,
          unit: "veo_seconds",
          charged: "yes",
          metadata: { provider: "kling", mock: true }
        });
        return {
          provider: "kling",
          model: KLING_MODEL,
          operationName,
          status: "completed",
          videoBytes: Buffer.from(`mock kling video for ${req.sceneId}`),
          mimeType: "video/mp4"
        };
      }

      const apiKey = credential.secret ?? process.env.FAL_API_KEY;
      if (!apiKey) {
        throw new ProviderError("Kling/fal.ai missing API key (FAL_API_KEY)", { provider: "kling" });
      }
      if (!req.referenceImage) {
        throw new ProviderError("Kling I2V requires a reference image per beat", {
          provider: "kling",
          metadata: { sceneId: req.sceneId }
        });
      }

      await hooks?.onPoll?.({ operationName, model: KLING_MODEL, status: "queued" });

      const imageUrl = `data:${req.referenceImage.mimeType};base64,${req.referenceImage.body.toString("base64")}`;
      const duration = req.durationSeconds >= 10 ? "10" : "5";
      const baseUrl = String(credential.config.baseUrl ?? "https://queue.fal.run");

      const queued = await httpJson<{ request_id?: string; status_url?: string; response_url?: string }>(
        `${baseUrl}/${KLING_MODEL}`,
        {
          method: "POST",
          headers: { Authorization: `Key ${apiKey}` },
          body: {
            prompt: req.prompt,
            image_url: imageUrl,
            duration,
            aspect_ratio: req.aspectRatio === "16:9" ? "16:9" : "9:16"
          },
          timeoutMs: 120_000
        }
      );

      const requestId = queued.request_id;
      if (!requestId) {
        throw new ProviderError("fal.ai Kling did not return request_id", { provider: "kling", metadata: { queued } });
      }

      const statusUrl = queued.status_url ?? `${baseUrl}/${KLING_MODEL}/requests/${requestId}/status`;
      const responseUrl = queued.response_url ?? `${baseUrl}/${KLING_MODEL}/requests/${requestId}`;

      await hooks?.onPoll?.({ operationName: requestId, model: KLING_MODEL, status: "polling" });

      const timeoutMs = Number(credential.config.videoTimeoutSeconds ?? 900) * 1000;
      const startedAt = Date.now();
      let lastStatus = "IN_QUEUE";

      while ((Date.now() - startedAt) < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, Number(credential.config.videoPollIntervalMs ?? 8000)));
        const status = await httpJson<{ status?: string; error?: string }>(statusUrl, {
          headers: { Authorization: `Key ${apiKey}` },
          timeoutMs: 30_000
        });
        lastStatus = status.status ?? lastStatus;
        await hooks?.onPoll?.({
          operationName: requestId,
          model: KLING_MODEL,
          status: lastStatus.toLowerCase(),
          error: status.error ?? null
        });

        if (lastStatus === "FAILED") {
          throw new ProviderError(`Kling generation failed: ${status.error ?? "unknown"}`, {
            provider: "kling",
            metadata: { requestId }
          });
        }

        if (lastStatus === "COMPLETED") {
          const payload = await httpJson<{ video?: { url?: string }; data?: { video?: { url?: string } } }>(responseUrl, {
            headers: { Authorization: `Key ${apiKey}` },
            timeoutMs: 60_000
          });
          const videoUrl = payload.video?.url ?? payload.data?.video?.url;
          if (!videoUrl) {
            throw new ProviderError("Kling completed without video URL", { provider: "kling", metadata: { requestId } });
          }
          const downloaded = await httpBytes(videoUrl, { timeoutMs: 240_000 });
          const durationMs = Date.now() - wallStarted;
          await hooks?.onUsage?.({
            activityType: "veo_video",
            sceneId: req.sceneId,
            model: KLING_MODEL,
            durationMs,
            billedUnits: Number(duration),
            unit: "veo_seconds",
            charged: "yes",
            metadata: { provider: "kling", requestId }
          });
          return {
            provider: "kling",
            model: KLING_MODEL,
            operationName: requestId,
            status: "completed",
            videoBytes: downloaded.body,
            mimeType: downloaded.mimeType ?? "video/mp4"
          };
        }
      }

      throw new ProviderError(`Kling timed out after ${Math.round(timeoutMs / 1000)}s (last: ${lastStatus})`, {
        provider: "kling",
        metadata: { requestId }
      });
    }
  };
}
