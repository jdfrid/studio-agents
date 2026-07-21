import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import { normalizeAudioForPlayback } from "../audio/pcm.js";
import { extractInlineData, geminiModels, geminiUrl } from "./common.js";
import { reportGenerateContentUsage } from "./reportUsage.js";
import type { GeminiUsageReporter } from "./usage.js";

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
  req: GeminiTtsRequest,
  onUsage?: GeminiUsageReporter
): Promise<GeminiTtsResponse> {
  const model = geminiModels(provider).tts;
  const started = Date.now();
  const voiceName = req.voiceName ?? String(provider.config.voiceName ?? "Kore");
  const style = req.style ? `[${req.style}] ` : "";
  const languageCode = toSpeechLanguageCode(req.language);

  const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
    method: "POST",
    body: {
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          languageCode,
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
  const normalized = normalizeAudioForPlayback(inline.data, inline.mimeType);
  await reportGenerateContentUsage(
    response,
    { activityType: "gemini_tts", model, startedMs: started, fallbackBilledUnits: req.text.length },
    onUsage
  );
  return {
    provider: "gemini",
    model,
    body: normalized.body,
    mimeType: normalized.mimeType,
    durationSeconds: null
  };
}

function toSpeechLanguageCode(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (normalized.startsWith("he")) return "he-IL";
  if (normalized.startsWith("en")) return "en-US";
  if (normalized.includes("-")) return language;
  return `${normalized}-${normalized.toUpperCase()}`;
}
