import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { geminiGenerateOmniVideo } from "../gemini/omni.js";
import type { VideoBeatGenerator, VideoBeatHooks, VideoBeatRequest, VideoBeatResult } from "./types.js";

export function createOmniBeatGenerator(
  profile: RenderProfile,
  credential: ProviderCredentialView
): VideoBeatGenerator {
  return {
    profile,
    async generateBeat(req: VideoBeatRequest, hooks?: VideoBeatHooks): Promise<VideoBeatResult> {
      const result = await geminiGenerateOmniVideo(
        credential,
        {
          sceneId: req.sceneId,
          prompt: req.prompt,
          aspectRatio: req.aspectRatio,
          durationBucket: req.durationBucket,
          durationSeconds: req.durationSeconds,
          referenceImage: req.referenceImage,
          firstFrame: req.firstFrame,
          generateAudio: false
        },
        {
          onPoll: async (operation) => {
            await hooks?.onPoll?.({
              operationName: operation.operationName,
              model: operation.model,
              status: operation.status,
              error: operation.error ?? null
            });
          },
          onRateLimitWait: hooks?.onRateLimitWait,
          onUsage: async (event) => {
            await hooks?.onUsage?.({
              activityType: event.activityType,
              sceneId: event.sceneId ?? req.sceneId,
              model: event.model ?? "gemini-omni",
              durationMs: event.durationMs ?? null,
              billedUnits: event.billedUnits,
              unit: event.unit,
              charged: event.charged ?? "unknown",
              metadata: event.metadata as Record<string, unknown> | undefined
            });
          }
        }
      );
      return {
        provider: result.model.includes("omni") ? "gemini-omni" : "gemini-veo",
        model: result.model,
        operationName: result.operationName,
        status: result.status === "completed" ? "completed" : "failed",
        videoBytes: result.videoBytes,
        mimeType: result.mimeType,
        error: result.error
      };
    }
  };
}
