import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import { normalizeAudioForPlayback } from "../audio/pcm.js";
import {
  describeGenerateContentFailure,
  extractInlineData,
  geminiModels,
  geminiUrl
} from "./common.js";
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
  const primaryModel = geminiModels(provider).tts;
  const text = req.text.trim();
  if (!text) {
    throw new ProviderError("Gemini TTS requires non-empty narration text", {
      provider: "gemini",
      metadata: { model: primaryModel }
    });
  }

  const started = Date.now();
  const voiceName = req.voiceName ?? String(provider.config.voiceName ?? "Kore");
  const style = req.style ? `[${req.style}] ` : "";
  const spoken = `${style}${text}`;
  const languageCode = toSpeechLanguageCode(req.language);

  // languageCode is optional and sometimes causes empty AUDIO responses for he-IL — retry without it.
  const attempts: Array<{ model: string; withLanguage: boolean }> = [
    { model: primaryModel, withLanguage: true },
    { model: primaryModel, withLanguage: false }
  ];
  const fallbackModel = alternateTtsModel(primaryModel);
  if (fallbackModel) {
    attempts.push({ model: fallbackModel, withLanguage: false });
  }

  let lastDetail = "empty candidates/parts";
  let lastModel = primaryModel;

  for (const attempt of attempts) {
    lastModel = attempt.model;
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["AUDIO"],
      speechConfig: {
        ...(attempt.withLanguage ? { languageCode } : {}),
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      }
    };

    const response = await httpJson<unknown>(geminiUrl(provider, `models/${attempt.model}:generateContent`), {
      method: "POST",
      body: {
        generationConfig,
        contents: [{ role: "user", parts: [{ text: spoken }] }]
      },
      timeoutMs: 120_000
    });

    const inline =
      extractInlineData(response, "audio/") ?? extractInlineData(response) ?? null;
    if (!inline) {
      lastDetail = describeGenerateContentFailure(response);
      continue;
    }

    const normalized = normalizeAudioForPlayback(inline.data, inline.mimeType);
    await reportGenerateContentUsage(
      response,
      { activityType: "gemini_tts", model: attempt.model, startedMs: started, fallbackBilledUnits: text.length },
      onUsage
    );
    return {
      provider: "gemini",
      model: attempt.model,
      body: normalized.body,
      mimeType: normalized.mimeType,
      durationSeconds: null
    };
  }

  throw new ProviderError(`Gemini TTS returned no audio inline data (${lastDetail})`, {
    provider: "gemini",
    metadata: { model: lastModel, detail: lastDetail }
  });
}

function alternateTtsModel(primary: string): string | null {
  const p = primary.trim().toLowerCase();
  const candidates = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts", "gemini-3.1-flash-tts-preview"];
  for (const c of candidates) {
    if (c.toLowerCase() !== p) return c;
  }
  return null;
}

function toSpeechLanguageCode(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (normalized.startsWith("he")) return "he-IL";
  if (normalized.startsWith("en")) return "en-US";
  if (normalized.includes("-")) return language;
  return `${normalized}-${normalized.toUpperCase()}`;
}
