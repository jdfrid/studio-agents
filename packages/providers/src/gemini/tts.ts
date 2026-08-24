import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import { concatWavBuffers, normalizeAudioForPlayback, wavDurationSeconds } from "../audio/pcm.js";
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

type TtsAttempt = {
  model: string;
  withLanguage: boolean;
  voiceName: string;
  spoken: string;
  label: string;
};

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

  try {
    return await synthesizeOnce(provider, req, text, onUsage);
  } catch (error) {
    const chunks = splitNarrationForTts(text);
    if (chunks.length < 2) throw error;
    const parts: Buffer[] = [];
    let model = primaryModel;
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(350);
      const part = await synthesizeOnce(provider, { ...req, style: undefined }, chunks[i]!, onUsage);
      model = part.model;
      parts.push(part.body);
    }
    const body = concatWavBuffers(parts);
    return {
      provider: "gemini",
      model,
      body,
      mimeType: "audio/wav",
      durationSeconds: wavDurationSeconds(body)
    };
  }
}

async function synthesizeOnce(
  provider: ProviderCredentialView,
  req: GeminiTtsRequest,
  text: string,
  onUsage?: GeminiUsageReporter
): Promise<GeminiTtsResponse> {
  const primaryModel = geminiModels(provider).tts;
  const started = Date.now();
  const isYiddish = req.language.trim().toLowerCase().startsWith("yi");
  const preferredVoice = req.voiceName ?? String(provider.config.voiceName ?? "Aoede");
  const languageCode = toSpeechLanguageCode(req.language);
  // Gemini TTS does not officially support yi-* codes — sending them often yields finishReason=OTHER.
  const canSendLanguage = Boolean(languageCode) && !isYiddish;

  const attempts = buildTtsAttempts({
    primaryModel,
    text,
    preferredVoice,
    style: req.style?.trim() || "",
    isYiddish,
    canSendLanguage
  });

  let lastDetail = "empty candidates/parts";
  let lastModel = primaryModel;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]!;
    if (i > 0) await sleep(200);
    lastModel = attempt.model;
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["AUDIO"],
      speechConfig: {
        ...(attempt.withLanguage && canSendLanguage && languageCode ? { languageCode } : {}),
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: attempt.voiceName }
        }
      }
    };

    const response = await httpJson<unknown>(geminiUrl(provider, `models/${attempt.model}:generateContent`), {
      method: "POST",
      body: {
        generationConfig,
        contents: [{ role: "user", parts: [{ text: attempt.spoken }] }]
      },
      timeoutMs: 120_000
    });

    const inline = extractInlineData(response, "audio/") ?? extractInlineData(response) ?? null;
    if (!inline) {
      lastDetail = `${describeGenerateContentFailure(response)} [${attempt.label}]`;
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
      durationSeconds: wavDurationSeconds(normalized.body)
    };
  }

  const yiddishHint = isYiddish
    ? " Yiddish TTS is best-effort on Gemini — try shorter lines, or Hebrew narration with Yiddish accent notes."
    : "";
  throw new ProviderError(`Gemini TTS returned no audio inline data (${lastDetail}).${yiddishHint}`, {
    provider: "gemini",
    metadata: { model: lastModel, detail: lastDetail, language: req.language }
  });
}

function buildTtsAttempts(input: {
  primaryModel: string;
  text: string;
  preferredVoice: string;
  style: string;
  isYiddish: boolean;
  canSendLanguage: boolean;
}): TtsAttempt[] {
  const models = [input.primaryModel, ...alternateTtsModels(input.primaryModel)];
  const voices = uniqueVoices([
    input.preferredVoice,
    "Aoede",
    "Kore",
    "Charon",
    "Puck",
    "Fenrir"
  ]);

  const spokenVariants: Array<{ spoken: string; label: string }> = [];
  if (input.isYiddish) {
    spokenVariants.push({
      spoken: `Read this narration aloud in Yiddish: ${input.text}`,
      label: "yi-soft"
    });
    spokenVariants.push({ spoken: input.text, label: "yi-plain" });
  } else {
    if (input.style) {
      spokenVariants.push({ spoken: `[${input.style}] ${input.text}`, label: "styled" });
    }
    spokenVariants.push({ spoken: input.text, label: "plain" });
  }

  const attempts: TtsAttempt[] = [];
  for (const spoken of spokenVariants) {
    for (const model of models) {
      for (const voiceName of voices.slice(0, spoken.label.includes("plain") ? 4 : 2)) {
        if (input.canSendLanguage) {
          attempts.push({
            model,
            withLanguage: true,
            voiceName,
            spoken: spoken.spoken,
            label: `${spoken.label}+lang+${voiceName}+${model}`
          });
        }
        attempts.push({
          model,
          withLanguage: false,
          voiceName,
          spoken: spoken.spoken,
          label: `${spoken.label}+nolang+${voiceName}+${model}`
        });
      }
    }
  }

  // Cap retries so a full-scene failure does not burn dozens of API calls.
  return attempts.slice(0, 10);
}

function splitNarrationForTts(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length < 90) return [trimmed];
  const parts = trimmed
    .split(/(?<=[.!?…。؟])\s+|(?<=[;؛])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts;
  const mid = Math.floor(trimmed.length / 2);
  const space = trimmed.indexOf(" ", mid);
  if (space > 20 && space < trimmed.length - 20) {
    return [trimmed.slice(0, space).trim(), trimmed.slice(space).trim()];
  }
  return [trimmed];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueVoices(names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const n = name.trim();
    if (!n) continue;
    if (out.some((x) => x.toLowerCase() === n.toLowerCase())) continue;
    out.push(n);
  }
  return out;
}

function alternateTtsModels(primary: string): string[] {
  const p = primary.trim().toLowerCase();
  const candidates = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts", "gemini-3.1-flash-tts-preview"];
  return candidates.filter((c) => c.toLowerCase() !== p);
}

function toSpeechLanguageCode(language: string): string | null {
  const normalized = language.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("yi")) return null; // unsupported — omit
  if (normalized.startsWith("he")) return "he-IL";
  if (normalized.startsWith("en")) return "en-US";
  if (normalized.startsWith("fr")) return "fr-FR";
  if (normalized.startsWith("ar")) return "ar-XA";
  if (normalized.startsWith("ru")) return "ru-RU";
  if (normalized.startsWith("es")) return "es-ES";
  if (normalized.includes("-")) return language;
  return `${normalized}-${normalized.toUpperCase()}`;
}
