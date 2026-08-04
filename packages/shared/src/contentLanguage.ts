/**
 * Content language for user-facing brief/script fields.
 * Technical motion / image prompts stay English for video models.
 */

export function looksLikeHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

export function normalizeContentLanguage(code?: string | null): string {
  const raw = String(code ?? "").trim();
  if (!raw) return "he";
  const lower = raw.toLowerCase();
  if (lower.startsWith("he") || raw.includes("עבר")) return "he";
  if (lower.startsWith("en") || raw.includes("אנגל")) return "en";
  if (lower.startsWith("fr") || raw.includes("צרפ")) return "fr";
  if (lower.startsWith("ar") || raw.includes("ערב")) return "ar";
  if (lower.startsWith("ru") || raw.includes("רוס")) return "ru";
  if (lower.startsWith("es") || raw.includes("ספרד")) return "es";
  if (lower.startsWith("yi") || raw.includes("ייד")) return "yi";
  return lower.slice(0, 8) || "he";
}

/** English name used in LLM system prompts. */
export function contentLanguageEnglishName(code?: string | null): string {
  switch (normalizeContentLanguage(code)) {
    case "he":
      return "Hebrew";
    case "en":
      return "English";
    case "fr":
      return "French";
    case "ar":
      return "Arabic";
    case "ru":
      return "Russian";
    case "es":
      return "Spanish";
    case "yi":
      return "Yiddish";
    default:
      return "Hebrew";
  }
}

/** Native display name for schema hints. */
export function contentLanguageNativeName(code?: string | null): string {
  switch (normalizeContentLanguage(code)) {
    case "he":
      return "עברית";
    case "en":
      return "English";
    case "fr":
      return "français";
    case "ar":
      return "العربية";
    case "ru":
      return "русский";
    case "es":
      return "español";
    case "yi":
      return "ייִדיש";
    default:
      return "עברית";
  }
}

export function resolveContentLanguage(input: {
  language?: string | null;
  creativeLanguage?: string | null;
  title?: string | null;
  sourceText?: string | null;
  instructions?: string | null;
}): string {
  const creative = String(input.creativeLanguage ?? "").trim();
  if (creative) {
    if (creative.includes("עבר")) return "he";
    if (creative.includes("אנגל")) return "en";
    if (creative.includes("צרפ")) return "fr";
    if (creative.includes("ייד")) return "yi";
    if (creative.includes("ערב")) return "ar";
    if (creative.includes("רוס")) return "ru";
    if (creative.includes("ספרד")) return "es";
  }
  if (input.language?.trim()) return normalizeContentLanguage(input.language);

  const sample = [input.title, input.sourceText, input.instructions].filter(Boolean).join(" ");
  if (looksLikeHebrew(sample)) return "he";
  const letters = sample.replace(/[^a-zA-Z\u0590-\u05FF]/g, "");
  if (letters.length >= 12 && !looksLikeHebrew(letters) && /[a-zA-Z]{8,}/.test(letters)) return "en";
  return "he";
}

/** LLM instruction block for user-facing copy language. */
export function userFacingLanguageInstruction(code?: string | null): string {
  const lang = normalizeContentLanguage(code);
  const enName = contentLanguageEnglishName(lang);
  const native = contentLanguageNativeName(lang);
  if (lang === "en") {
    return `CONTENT LANGUAGE (mandatory): Write ALL user-facing text in English. Do not mix in other languages.`;
  }
  return [
    `CONTENT LANGUAGE (mandatory): Write ALL user-facing text in ${enName} (${native}).`,
    `If the user wrote in ${enName}, keep that language — do NOT translate user-facing fields into English.`,
    `User-facing fields include: title, summary, targetAudience, toneOfVoice, style, visualDirection, musicDirection, callToAction, brandConstraints, narration, scene titles, characterBible, backgroundVisualPrompt, musicPrompt.`,
    `Technical motion/image prompts (veoPrompt, visualPrompt, referenceImagePrompt) stay in English for video models.`
  ].join(" ");
}
