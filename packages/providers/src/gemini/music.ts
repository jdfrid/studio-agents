import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import { extractInlineData, geminiModels, geminiUrl } from "./common.js";

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

export async function geminiGenerateMusic(
  provider: ProviderCredentialView,
  req: GeminiMusicRequest
): Promise<GeminiMusicResponse> {
  const enabled = provider.config.musicEnabled === true || process.env.GEMINI_LYRIA_ENABLED === "1";
  const model = geminiModels(provider).music;
  if (!enabled) {
    throw new ProviderError("Gemini/Lyria music generation is not enabled for this account/config.", {
      provider: "gemini",
      metadata: { model, hint: "Set ProviderCredential.config.musicEnabled=true after verifying Lyria access." }
    });
  }

  const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
    method: "POST",
    body: {
      generationConfig: { responseModalities: ["AUDIO"] },
      contents: [
        {
          role: "user",
          parts: [{ text: `${req.prompt}\nDuration target: ${req.durationSeconds ?? 30}s. Return music only, no speech.` }]
        }
      ]
    },
    timeoutMs: 180_000
  });
  const inline = extractInlineData(response, "audio/");
  if (!inline) {
    throw new ProviderError("Gemini/Lyria returned no music audio inline data", { provider: "gemini", metadata: { model } });
  }
  return { provider: "gemini", model, body: inline.data, mimeType: inline.mimeType, durationSeconds: req.durationSeconds ?? null };
}
