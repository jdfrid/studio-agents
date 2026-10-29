import { stripNiqqud } from "@studio/shared";

/** Text-to-speech model that speaks Hebrew. v2 ignores language_code and does not. */
export const ELEVENLABS_HEBREW_MODEL = "eleven_v3";

const MODELS_WITHOUT_HEBREW = new Set([
  "eleven_multilingual_v2",
  "eleven_multilingual_v1",
  "eleven_flash_v2",
  "eleven_flash_v2_5",
  "eleven_turbo_v2",
  "eleven_turbo_v2_5",
  "eleven_monolingual_v1"
]);

const LANGUAGE_CODES: Record<string, string> = {
  he: "he",
  iw: "he",
  en: "en",
  ar: "ar",
  ru: "ru",
  fr: "fr",
  es: "es"
};

export function elevenLabsLanguageCode(language: string): string | null {
  const raw = language.trim().toLowerCase();
  if (!raw) return null;
  const base = raw.split(/[-_]/)[0] ?? raw;
  return LANGUAGE_CODES[base] ?? null;
}

/**
 * Hebrew always uses eleven_v3 and an unpointed script. Vowel points are for Gemini;
 * ElevenLabs bills every character and reads modern Hebrew without them.
 */
export function resolveElevenLabsSpeech(input: {
  text: string;
  language: string;
  model?: string | null;
}): { text: string; modelId: string; languageCode: string | null } {
  const languageCode = elevenLabsLanguageCode(input.language);
  const requested = String(input.model ?? "").trim();
  const hebrew = languageCode === "he";
  const modelId =
    hebrew && (!requested || MODELS_WITHOUT_HEBREW.has(requested))
      ? ELEVENLABS_HEBREW_MODEL
      : requested || ELEVENLABS_HEBREW_MODEL;
  const sendLanguage = MODELS_WITHOUT_HEBREW.has(modelId) ? null : languageCode;
  return {
    text: hebrew ? stripNiqqud(input.text) : input.text,
    modelId,
    languageCode: sendLanguage
  };
}
