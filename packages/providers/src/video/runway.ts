import type { ProviderCredentialView, RenderProfile } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { fetch as undiciFetch, FormData as UndiciFormData, File as UndiciFile } from "undici";
import { httpBytes, httpJson } from "../http.js";
import type { VideoBeatGenerator, VideoBeatHooks, VideoBeatRequest, VideoBeatResult } from "./types.js";

export const RUNWAY_API_BASE = "https://api.dev.runwayml.com";
export const RUNWAY_API_VERSION = "2024-11-06";
export const RUNWAY_DEFAULT_MODEL = "grok_imagine_1_5_lite";
/** Runway data URIs are limited to ~5 MB once base64-encoded. */
const MAX_DATA_URI_IMAGE_BYTES = 3_500_000;

type RunwayCreateResponse = { id?: string; estimatedCost?: { credits?: number } };
type RunwayTaskResponse = {
  id?: string;
  status?: "PENDING" | "THROTTLED" | "CANCELLED" | "RUNNING" | "FAILED" | "SUCCEEDED";
  progress?: number;
  failure?: string;
  failureCode?: string;
  output?: string[];
  cost?: { credits?: number };
  estimatedCost?: { credits?: number };
};

export function resolveRunwayBaseUrl(credential?: Pick<ProviderCredentialView, "config"> | null): string {
  const raw = String(credential?.config?.baseUrl ?? process.env.RUNWAY_API_BASE ?? "").trim();
  return (raw || RUNWAY_API_BASE).replace(/\/$/, "");
}

export function runwayHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-Runway-Version": RUNWAY_API_VERSION,
    "Content-Type": "application/json"
  };
}

export function runwayApiKey(credential?: Pick<ProviderCredentialView, "secret"> | null): string | null {
  return credential?.secret?.trim() || process.env.RUNWAYML_API_SECRET?.trim() || process.env.RUNWAY_API_KEY?.trim() || null;
}

export function clampRunwayDuration(seconds: number): number {
  return Math.min(15, Math.max(1, Math.round(Number.isFinite(seconds) ? seconds : 6) || 6));
}

/** Grok Imagine Lite: 2 credits/s at 480p, 3 at 720p; image start frame adds 1 credit. */
export function runwayResolution(): "480p" | "720p" {
  return String(process.env.RUNWAY_VIDEO_RESOLUTION ?? "720p").trim().toLowerCase() === "480p" ? "480p" : "720p";
}

export function beatStartImage(req: VideoBeatRequest): { body: Buffer; mimeType: string } | null {
  const image = req.referenceImage ?? req.firstFrame ?? null;
  return image?.body?.length ? image : null;
}

export function buildRunwayCreateBody(
  req: VideoBeatRequest,
  model = RUNWAY_DEFAULT_MODEL,
  imageUri?: string | null
): {
  endpoint: "/v1/image_to_video" | "/v1/text_to_video";
  body: Record<string, unknown>;
} {
  const promptText = (req.prompt?.trim() || "A clear, natural scene with one subject and a gently moving camera.").slice(0, 2500);
  const duration = clampRunwayDuration(req.durationSeconds);
  const resolution = runwayResolution();
  if (imageUri) {
    return {
      endpoint: "/v1/image_to_video",
      body: {
        model,
        promptImage: [{ uri: imageUri, position: "first" }],
        promptText,
        duration,
        ratio: resolution === "480p" ? "auto_480p" : "auto_720p"
      }
    };
  }
  const portrait = req.aspectRatio !== "16:9";
  const ratio = resolution === "480p" ? (portrait ? "480:848" : "848:480") : portrait ? "720:1280" : "1280:720";
  return { endpoint: "/v1/text_to_video", body: { model, promptText, duration, ratio } };
}

function extForMime(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

/** Small stills go inline as data URIs; larger ones through Runway's ephemeral upload. */
async function resolveImageUri(
  baseUrl: string,
  apiKey: string,
  image: { body: Buffer; mimeType: string },
  sceneId: string
): Promise<string> {
  const mimeType = image.mimeType || "image/png";
  if (image.body.length <= MAX_DATA_URI_IMAGE_BYTES) {
    return `data:${mimeType};base64,${image.body.toString("base64")}`;
  }
  const upload = await httpJson<{ uploadUrl?: string; fields?: Record<string, string>; runwayUri?: string }>(
    `${baseUrl}/v1/uploads`,
    { method: "POST", headers: runwayHeaders(apiKey), body: { filename: `scene-${sceneId}.${extForMime(mimeType)}`, type: "ephemeral" } }
  );
  if (!upload.uploadUrl || !upload.runwayUri) {
    throw new ProviderError("Runway upload returned no uploadUrl", { provider: "runway", metadata: { upload } });
  }
  const form = new UndiciFormData();
  for (const [key, value] of Object.entries(upload.fields ?? {})) form.append(key, value);
  form.append("file", new UndiciFile([image.body], `scene-${sceneId}.${extForMime(mimeType)}`, { type: mimeType }));
  const res = await undiciFetch(upload.uploadUrl, { method: "POST", body: form });
  if (!res.ok) {
    throw new ProviderError(`Runway image upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`, {
      provider: "runway",
      metadata: { status: res.status }
    });
  }
  return upload.runwayUri;
}

export function createRunwayBeatGenerator(
  profile: RenderProfile,
  credential: ProviderCredentialView
): VideoBeatGenerator {
  const model = String(credential.config.model ?? process.env.RUNWAY_VIDEO_MODEL ?? RUNWAY_DEFAULT_MODEL).trim() || RUNWAY_DEFAULT_MODEL;
  return {
    profile,
    async generateBeat(req: VideoBeatRequest, hooks?: VideoBeatHooks): Promise<VideoBeatResult> {
      const wallStarted = Date.now();
      const startImage = beatStartImage(req);

      if (credential.config.mock === true || process.env.RUNWAY_MOCK === "1") {
        const mode = startImage ? "image_to_video" : "text_to_video";
        await hooks?.onUsage?.({
          activityType: "veo_video",
          sceneId: req.sceneId,
          model,
          durationMs: 0,
          billedUnits: clampRunwayDuration(req.durationSeconds),
          unit: "veo_seconds",
          charged: "yes",
          metadata: { provider: "runway", mock: true, mode }
        });
        return {
          provider: "runway",
          model,
          operationName: `runway/${req.sceneId}/${Date.now()}`,
          status: "completed",
          videoBytes: Buffer.from(`mock runway video for ${req.sceneId}`),
          mimeType: "video/mp4"
        };
      }

      const apiKey = runwayApiKey(credential);
      if (!apiKey) {
        throw new ProviderError("Runway missing API key (RUNWAYML_API_SECRET)", { provider: "runway" });
      }
      const baseUrl = resolveRunwayBaseUrl(credential);
      await hooks?.onPoll?.({ operationName: `runway/${req.sceneId}`, model, status: "queued" });
      const imageUri = startImage ? await resolveImageUri(baseUrl, apiKey, startImage, req.sceneId) : null;
      const { endpoint, body } = buildRunwayCreateBody(req, model, imageUri);
      const mode = endpoint === "/v1/image_to_video" ? "image_to_video" : "text_to_video";

      const created = await httpJson<RunwayCreateResponse>(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: runwayHeaders(apiKey),
        body,
        timeoutMs: 120_000
      });
      const taskId = created.id;
      if (!taskId) {
        throw new ProviderError("Runway create returned no task id", { provider: "runway", metadata: { created } });
      }
      await hooks?.onPoll?.({ operationName: taskId, model, status: "polling" });

      const timeoutMs = Number(credential.config.videoTimeoutSeconds ?? process.env.RUNWAY_TIMEOUT_SECONDS ?? 900) * 1000;
      // Runway asks clients not to poll a task more often than every 5 seconds.
      const pollMs = Math.max(5000, Number(credential.config.videoPollIntervalMs ?? process.env.RUNWAY_POLL_MS ?? 5000));
      const startedAt = Date.now();
      let lastStatus = "PENDING";

      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const task = await httpJson<RunwayTaskResponse>(`${baseUrl}/v1/tasks/${taskId}`, {
          headers: runwayHeaders(apiKey),
          timeoutMs: 30_000
        });
        lastStatus = task.status ?? lastStatus;
        await hooks?.onPoll?.({ operationName: taskId, model, status: lastStatus.toLowerCase(), error: task.failure ?? null });

        if (lastStatus === "FAILED" || lastStatus === "CANCELLED") {
          throw new ProviderError(
            `Runway generation ${lastStatus.toLowerCase()}: ${task.failureCode ?? ""} ${task.failure ?? "unknown"}`.trim(),
            { provider: "runway", metadata: { taskId, failureCode: task.failureCode, raw: `runway ${task.failure ?? ""}` } }
          );
        }
        if (lastStatus === "SUCCEEDED") {
          const url = task.output?.[0];
          if (!url) {
            throw new ProviderError("Runway task succeeded without output", { provider: "runway", metadata: { taskId } });
          }
          const downloaded = await httpBytes(url, { timeoutMs: 240_000 });
          await hooks?.onUsage?.({
            activityType: "veo_video",
            sceneId: req.sceneId,
            model,
            durationMs: Date.now() - wallStarted,
            billedUnits: Number(body.duration) || clampRunwayDuration(req.durationSeconds),
            unit: "veo_seconds",
            charged: "yes",
            metadata: {
              provider: "runway",
              taskId,
              mode,
              credits: task.cost?.credits ?? created.estimatedCost?.credits ?? null
            }
          });
          return {
            provider: "runway",
            model,
            operationName: taskId,
            status: "completed",
            videoBytes: downloaded.body,
            mimeType: downloaded.mimeType.includes("mp4") ? "video/mp4" : downloaded.mimeType
          };
        }
      }

      throw new ProviderError(`Runway timed out after ${timeoutMs}ms (last status: ${lastStatus})`, {
        provider: "runway",
        metadata: { taskId, lastStatus }
      });
    }
  };
}
