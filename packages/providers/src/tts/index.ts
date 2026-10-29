import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpBytes } from "../http.js";
import { resolveElevenLabsSpeech } from "./elevenLabsSpeech.js";

export { ELEVENLABS_HEBREW_MODEL, resolveElevenLabsSpeech } from "./elevenLabsSpeech.js";

export { elevenLabsCloneVoice, elevenLabsDeleteVoice } from "./elevenlabsClone.js";

export interface TtsRequest {
  text: string;
  language: string;
  voice?: string;
}

export interface TtsResponse {
  provider: string;
  body: Buffer;
  mimeType: string;
  durationSeconds: number | null;
}

export async function synthesizeSpeech(provider: ProviderCredentialView, req: TtsRequest): Promise<TtsResponse> {
  const name = provider.provider.toLowerCase();
  if (name.includes("eleven")) return elevenLabs(provider, req);
  if (name.includes("openai")) return openaiTts(provider, req);
  throw new ProviderError(`Unsupported TTS provider: ${provider.provider}`, { provider: provider.provider });
}

async function elevenLabs(provider: ProviderCredentialView, req: TtsRequest): Promise<TtsResponse> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("ElevenLabs missing API key", { provider: provider.provider });
  const voice = req.voice ?? String(provider.config.voiceId ?? "21m00Tcm4TlvDq8ikWAM");
  const speech = resolveElevenLabsSpeech({
    text: req.text,
    language: req.language,
    model: typeof provider.config.model === "string" ? provider.config.model : null
  });
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;
  const { body, mimeType } = await httpBytes(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, accept: "audio/mpeg", "content-type": "application/json" },
    body: {
      text: speech.text,
      model_id: speech.modelId,
      ...(speech.languageCode ? { language_code: speech.languageCode } : {})
    },
    timeoutMs: 120_000
  });
  return { provider: provider.provider, body, mimeType, durationSeconds: null };
}

async function openaiTts(provider: ProviderCredentialView, req: TtsRequest): Promise<TtsResponse> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("OpenAI TTS missing API key", { provider: provider.provider });
  const model = String(provider.config.model ?? "tts-1");
  const voice = req.voice ?? String(provider.config.voice ?? "alloy");
  const { body, mimeType } = await httpBytes("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: { model, voice, input: req.text, response_format: "mp3" },
    timeoutMs: 60_000
  });
  return { provider: provider.provider, body, mimeType, durationSeconds: null };
}
