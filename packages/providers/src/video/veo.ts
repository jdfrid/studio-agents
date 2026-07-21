import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { geminiGenerateVeoVideo, type GeminiVeoOperation } from "../gemini/video.js";
import type { VideoBeatGenerator, VideoBeatHooks, VideoBeatRequest, VideoBeatResult } from "./types.js";

export function createVeoBeatGenerator(profile: RenderProfile, credential: ProviderCredentialView): VideoBeatGenerator {
  return {
    profile,
    async generateBeat(req: VideoBeatRequest, hooks?: VideoBeatHooks): Promise<VideoBeatResult> {
      const result = await geminiGenerateVeoVideo(
        credential,
        {
          sceneId: req.sceneId,
          prompt: req.prompt,
          aspectRatio: req.aspectRatio,
          durationBucket: req.durationBucket,
          referenceImage: req.referenceImage,
          firstFrame: req.firstFrame,
          lastFrame: req.lastFrame,
          extendVideoHandle: req.extendVideoHandle,
          generateAudio: req.generateAudio
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
          onUsage: async (event) => {
            await hooks?.onUsage?.({
              activityType: event.activityType,
              sceneId: event.sceneId ?? req.sceneId,
              model: event.model ?? "veo",
              durationMs: event.durationMs ?? null,
              billedUnits: event.billedUnits,
              unit: event.unit,
              charged: event.charged ?? "unknown",
              metadata: event.metadata as Record<string, unknown> | undefined
            });
          }
        }
      );
      return mapVeoResult(result);
    }
  };
}

function mapVeoResult(result: GeminiVeoOperation): VideoBeatResult {
  return {
    provider: "gemini-veo",
    model: result.model,
    operationName: result.operationName,
    status: result.status === "completed" ? "completed" : "failed",
    videoBytes: result.videoBytes,
    mimeType: result.mimeType,
    extendHandle: resolveExtendHandle(result),
    error: result.error
  };
}

export function resolveExtendHandle(result: GeminiVeoOperation): string {
  if (result.videoUrl) return result.videoUrl;
  if (result.videoFileName) return result.videoFileName;
  return result.operationName;
}
