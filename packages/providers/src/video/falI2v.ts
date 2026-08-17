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
    // Wan 2.7 accepts numeric duration seconds (typically 2–15).
    return Math.min(5, Math.max(2, Math.round(seconds) || 5));
  }
  if (
    profile.id === "seedance-mini-i2v" ||
    profile.id === "seedance-fast-i2v" ||
    profile.id === "seedance-i2v"
  ) {
    const clamped = Math.min(15, Math.max(4, Math.round(seconds) || 5));
    return String(clamped);
  }
  if (profile.id === "luma-ray-i2v") {
    // Single-image i2v supports 5s only; 10s needs multi-keyframe.
    return "5s";
  }
  return seconds >= 10 ? "10" : "5";
}

function isSeedanceProfile(profile: RenderProfile): boolean {
  return (
    profile.id === "seedance-mini-i2v" ||
    profile.id === "seedance-fast-i2v" ||
    profile.id === "seedance-i2v"
  );
}

function buildFalBody(
  profile: RenderProfile,
  req: VideoBeatRequest,
  imageUrl: string,
  duration: string | number,
  promptOverride?: string
): Record<string, unknown> {
  // Kling rejects prompts > 2500; Wan/Hailuo/Seedance/Luma are safer under the same cap.
  const prompt = clampFalPrompt(softenFalMotionPrompt(promptOverride ?? req.prompt), 2400);
  const body: Record<string, unknown> = {
    prompt,
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

  if (profile.id === "wan-i2v" || isSeedanceProfile(profile) || profile.id === "luma-ray-i2v") {
    body.resolution = "720p";
  }

  if (isSeedanceProfile(profile)) {
    // Studio narration is muxed later — skip model-native audio to avoid double track.
    body.generate_audio = false;
  }

  return body;
}

/** Strip public-figure / copyright-prone wording before fal Seedance/Kling/etc. */
export function softenFalMotionPrompt(text: string): string {
  let t = String(text ?? "").trim();
  t = t.replace(/Keep the exact same people, faces, wardrobe, and place as the reference image\.?/gi, "");
  t = t.replace(/IDENTICAL people, faces[^.]*\.?/gi, "");
  t = t.replace(/\b(netanyahu|trump|biden|obama|putin|zelensky|macron|merkel|celebrity|politician)\b/gi, "person");
  t = t.replace(/מנהיג(?:ה)?\s+ישראלי(?:ת)?/gi, "גבר מבוגר בחליפה");
  t = t.replace(/ראש\s+הממשלה|נשיא\s+ארצות\s+הברית|נשיא\s+ארה["״]?ב/gi, "דמות בדיונית");
  t = t.replace(/\b(israeli\s+leader|us\s+president|prime\s+minister|head\s+of\s+state)\b/gi, "older man in a suit");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

function clampFalPrompt(text: string, max: number): string {
  const t = String(text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function isContentPolicyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const meta =
    err && typeof err === "object" && "metadata" in err
      ? String((err as { metadata?: { kind?: string; raw?: string } }).metadata?.kind ?? "") +
        String((err as { metadata?: { raw?: string } }).metadata?.raw ?? "")
      : "";
  const hay = `${msg}\n${meta}`.toLowerCase();
  return (
    hay.includes("content_policy") ||
    hay.includes("copyright") ||
    hay.includes("sensitive content") ||
    hay.includes("partner_validation") ||
    hay.includes("דמות מוכרת")
  );
}

function motionOnlyFallbackPrompt(prompt: string, orderHint?: string): string {
  const softened = softenFalMotionPrompt(prompt);
  // Drop long cast/bible clauses in parentheses — keep camera/action language.
  const withoutParens = softened.replace(/\([^)]{20,}\)/g, " ");
  const clipped = withoutParens.replace(/\s{2,}/g, " ").trim().slice(0, 900);
  return [
    orderHint ?? "",
    "Animate the reference image with natural motion and a subtle camera move.",
    "Fictional characters only; no real public figures, celebrities, or brand logos.",
    clipped
  ]
    .filter(Boolean)
    .join(" ");
}

function billedSecondsFromDuration(duration: string | number): number {
  if (typeof duration === "number") return duration;
  const matched = String(duration).match(/^(\d+)/);
  return matched ? Number(matched[1]) : Number(duration) || 5;
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
      const prompts = [req.prompt, motionOnlyFallbackPrompt(req.prompt)];

      let lastError: unknown;
      for (let attempt = 0; attempt < prompts.length; attempt += 1) {
        const prompt = prompts[attempt]!;
        try {
          const body = buildFalBody(profile, req, imageUrl, duration, prompt);
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
              const failMsg = status.error ?? "unknown";
              throw new ProviderError(`${providerTag} generation failed: ${failMsg}`, {
                provider: providerTag,
                metadata: {
                  requestId,
                  model,
                  kind: isContentPolicyError(failMsg) ? "content_policy_violation" : "failed"
                }
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
              const billed = billedSecondsFromDuration(duration);
              await hooks?.onUsage?.({
                activityType: "veo_video",
                sceneId: req.sceneId,
                model,
                durationMs,
                billedUnits: billed,
                unit: "veo_seconds",
                charged: "yes",
                metadata: { provider: providerTag, requestId, promptAttempt: attempt + 1 }
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
        } catch (err) {
          lastError = err;
          if (attempt + 1 < prompts.length && isContentPolicyError(err)) {
            await hooks?.onPoll?.({
              operationName,
              model,
              status: "retrying",
              error: "content_policy_violation — retrying with softened motion prompt"
            });
            continue;
          }
          throw err;
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new ProviderError(`${providerTag} generation failed`, { provider: providerTag });
    }
  };
}