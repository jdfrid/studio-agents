import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import { extractInlineData, geminiModels, geminiUrl } from "./common.js";

export interface GeminiTtsRequest {
  text: string;
  language: string;
  voiceName?: string;
  style?: string;
}

export interface GeminiTtsResponse {
  provider: "gemini";
  model: string;
  body: Buffer;
  mimeType: string;
  durationSeconds: number | null;
}

export async function geminiSynthesizeSpeech(
  provider: ProviderCredentialView,
  req: GeminiTtsRequest
): Promise<GeminiTtsResponse> {
  const model = geminiModels(provider).tts;
  const voiceName = req.voiceName ?? String(provider.config.voiceName ?? "Kore");
  const style = req.style ? `[${req.style}] ` : "";

  const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
    method: "POST",
    body: {
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `${style}${req.text}` }]
        }
      ]
    },
    timeoutMs: 120_000
  });

  const inline = extractInlineData(response, "audio/");
  if (!inline) {
    throw new ProviderError("Gemini TTS returned no audio inline data", { provider: "gemini", metadata: { model } });
  }
  return { provider: "gemini", model, body: inline.data, mimeType: inline.mimeType, durationSeconds: null };
}
