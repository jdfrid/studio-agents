import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { normalizeAudioForPlayback } from "../audio/pcm.js";
import { httpJson } from "../http.js";
import { extractInlineData, extractText, geminiModels, geminiUrl } from "./common.js";
import type { GeminiUsageReporter } from "./usage.js";

export interface GeminiMusicRequest {
  prompt: string;
  durationSeconds?: number;
}

export interface GeminiMusicResponse {
  provider: "gemini";
  model: string;
  body: Buffer;
  mimeType: string;
  durationSeconds: number | null;
}

function isLyriaEnabled(provider: ProviderCredentialView): boolean {
  if (process.env.GEMINI_LYRIA_ENABLED === "0") return false;
  if (provider.config.musicEnabled === false) return false;
  return true;
}

function pickMusicModel(provider: ProviderCredentialView, durationSeconds?: number): string {
  const configured = geminiModels(provider).music;
  if (process.env.GEMINI_MUSIC_MODEL?.trim()) return configured;
  return (durationSeconds ?? 30) > 35 ? "lyria-3-pro-preview" : configured;
}

function buildMusicPrompt(req: GeminiMusicRequest): string {
  const duration = req.durationSeconds ?? 30;
  const modelHint =
    duration > 35
      ? `Create a ${Math.min(Math.max(duration, 60), 180)}-second instrumental track.`
      : "Create a 30-second instrumental clip.";
  return `${req.prompt}\n${modelHint} Background music for a short-form video. Instrumental only, no vocals.`;
}

export async function geminiGenerateMusic(
  provider: ProviderCredentialView,
  req: GeminiMusicRequest,
  onUsage?: GeminiUsageReporter
): Promise<GeminiMusicResponse> {
  if (!isLyriaEnabled(provider)) {
    throw new ProviderError("Gemini/Lyria music generation is disabled (GEMINI_LYRIA_ENABLED=0).", {
      provider: "gemini",
      metadata: { hint: "Set GEMINI_LYRIA_ENABLED=1 in infra/hetzner/.env to enable Lyria." }
    });
  }

  const model = pickMusicModel(provider, req.durationSeconds);
  const started = Date.now();
  const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
    method: "POST",
    body: {
      contents: [
        {
          role: "user",
          parts: [{ text: buildMusicPrompt(req) }]
        }
      ]
    },
    timeoutMs: 180_000
  });

  const inline = extractInlineData(response, "audio/");
  if (!inline) {
    const text = extractText(response);
    throw new ProviderError("Gemini/Lyria returned no music audio inline data", {
      provider: "gemini",
      metadata: { model, textPreview: text.slice(0, 240) }
    });
  }

  const normalized = normalizeAudioForPlayback(inline.data, inline.mimeType);
  const billedSeconds = req.durationSeconds ?? 30;
  await onUsage?.({
    activityType: "gemini_music",
    model,
    durationMs: Date.now() - started,
    billedUnits: billedSeconds,
    unit: "music_seconds",
    charged: "yes"
  });
  return {
    provider: "gemini",
    model,
    body: normalized.body,
    mimeType: normalized.mimeType,
    durationSeconds: req.durationSeconds ?? null
  };
}
