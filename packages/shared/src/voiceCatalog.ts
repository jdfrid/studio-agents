/** Gemini TTS character catalog — timbre presets, not speaking-style (speechStyle). */

export type VoiceCharacterAge = "adult" | "child" | "baby";

export type VoiceCharacterId =
  | "male_clear"
  | "male_deep"
  | "male_young"
  | "male_gravel"
  | "male_warm"
  | "male_news"
  | "female_clear"
  | "female_soft"
  | "female_bright"
  | "female_mature"
  | "female_warm"
  | "female_young"
  | "child_boy"
  | "child_girl"
  | "baby"
  | "funny"
  | "distorted"
  | "formal"
  | "silly";

export type VoiceCharacterPreset = {
  id: VoiceCharacterId;
  group: "adult_male" | "adult_female" | "character";
  sex: "male" | "female";
  age: VoiceCharacterAge;
  geminiVoice: string;
  /** English timbre instruction prepended to Gemini TTS as [style]. */
  timbrePrompt: string;
  /** Optional cheap chipmunk/robot pitch (semitones). Positive = higher. */
  pitchSemitones?: number;
  labelHe: string;
  labelEn: string;
};

export const VOICE_CHARACTER_PRESETS: readonly VoiceCharacterPreset[] = [
  {
    id: "male_clear",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Charon",
    timbrePrompt: "Clear adult male narrator, even mid-range timbre, crisp diction",
    labelHe: "גבר — ברור",
    labelEn: "Man — clear"
  },
  {
    id: "male_deep",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Rasalgethi",
    timbrePrompt: "Deep adult male voice, low chest resonance, unhurried",
    labelHe: "גבר — עמוק",
    labelEn: "Man — deep"
  },
  {
    id: "male_young",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Puck",
    timbrePrompt: "Young adult male, light and bright, early-20s energy",
    labelHe: "גבר — צעיר",
    labelEn: "Man — young"
  },
  {
    id: "male_gravel",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Algenib",
    timbrePrompt: "Gravelly adult male, slightly raspy texture, lived-in",
    labelHe: "גבר — חצץ",
    labelEn: "Man — gravelly"
  },
  {
    id: "male_warm",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Algieba",
    timbrePrompt: "Warm adult male, friendly and rounded, close-mic",
    labelHe: "גבר — חם",
    labelEn: "Man — warm"
  },
  {
    id: "male_news",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Orus",
    timbrePrompt: "Adult male newsreader, firm and composed, broadcast diction",
    labelHe: "גבר — חדשותי",
    labelEn: "Man — news"
  },
  {
    id: "female_clear",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Kore",
    timbrePrompt: "Clear adult female narrator, even mid-range timbre, crisp diction",
    labelHe: "אישה — ברורה",
    labelEn: "Woman — clear"
  },
  {
    id: "female_soft",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Sulafat",
    timbrePrompt: "Soft adult female, gentle and airy, soothing",
    labelHe: "אישה — רכה",
    labelEn: "Woman — soft"
  },
  {
    id: "female_bright",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Zephyr",
    timbrePrompt: "Bright adult female, higher and sparkling, lively",
    labelHe: "אישה — בהירה",
    labelEn: "Woman — bright"
  },
  {
    id: "female_mature",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Gacrux",
    timbrePrompt: "Mature adult female, lower and grounded, confident",
    labelHe: "אישה — בוגרת",
    labelEn: "Woman — mature"
  },
  {
    id: "female_warm",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Aoede",
    timbrePrompt: "Warm adult female, friendly and rounded, close-mic",
    labelHe: "אישה — חמה",
    labelEn: "Woman — warm"
  },
  {
    id: "female_young",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Leda",
    timbrePrompt: "Young adult female, light and youthful, early-20s energy",
    labelHe: "אישה — צעירה",
    labelEn: "Woman — young"
  },
  {
    id: "child_boy",
    group: "character",
    sex: "male",
    age: "child",
    geminiVoice: "Puck",
    timbrePrompt: "Young boy child voice, about 7–10 years old, natural kid timbre, not an adult imitating a child",
    labelHe: "דמות — ילד",
    labelEn: "Character — boy"
  },
  {
    id: "child_girl",
    group: "character",
    sex: "female",
    age: "child",
    geminiVoice: "Leda",
    timbrePrompt: "Young girl child voice, about 7–10 years old, natural kid timbre, not an adult imitating a child",
    labelHe: "דמות — ילדה",
    labelEn: "Character — girl"
  },
  {
    id: "baby",
    group: "character",
    sex: "female",
    age: "baby",
    geminiVoice: "Leda",
    timbrePrompt:
      "Very young toddler voice, high and small, approximating a toddler — not a realistic infant cry",
    pitchSemitones: 5,
    labelHe: "דמות — תינוק (קירוב)",
    labelEn: "Character — baby (approximation)"
  },
  {
    id: "funny",
    group: "character",
    sex: "male",
    age: "adult",
    geminiVoice: "Fenrir",
    timbrePrompt: "Funny cartoon character voice, playful exaggeration, comic timing, not a straight announcer",
    labelHe: "דמות — מצחיק / קריקטורה",
    labelEn: "Character — funny / cartoon"
  },
  {
    id: "distorted",
    group: "character",
    sex: "male",
    age: "adult",
    geminiVoice: "Algenib",
    timbrePrompt: "Distorted robotic voice, metallic and processed, slightly unnatural resonance",
    pitchSemitones: -3,
    labelHe: "דמות — מעוות / רובוטי",
    labelEn: "Character — distorted / robotic"
  },
  {
    id: "formal",
    group: "character",
    sex: "male",
    age: "adult",
    geminiVoice: "Orus",
    timbrePrompt: "Formal official voice, ceremonial and measured, state-broadcast diction",
    labelHe: "דמות — רשמי",
    labelEn: "Character — formal"
  },
  {
    id: "silly",
    group: "character",
    sex: "male",
    age: "adult",
    geminiVoice: "Puck",
    timbrePrompt: "Silly goofy voice, slightly foolish and over-the-top, light comic character",
    labelHe: "דמות — טיפשי / מטופש",
    labelEn: "Character — silly"
  }
] as const;

const PRESET_BY_ID = new Map(VOICE_CHARACTER_PRESETS.map((preset) => [preset.id, preset]));

/** Older Hebrew «סגנון קול» values stored in drafts before the character catalog. */
const LEGACY_VOICE_TYPE_TO_CHARACTER: Record<string, VoiceCharacterId> = {
  עמוק: "male_deep",
  סמכותי: "male_news",
  ידידותי: "female_warm",
  צעיר: "male_young",
  מבוגר: "female_mature",
  חם: "female_warm",
  רך: "female_soft",
  אנרגטי: "male_young",
  טבעי: "male_clear",
  "מספר סיפורים": "male_warm",
  רשמי: "formal",
  רדיופוני: "male_news",
  "קרוב ואישי": "female_soft",
  טכנולוגי: "distorted"
};

export function voiceCharacterFieldOptions(): Array<{ value: string; labelHe: string; labelEn: string }> {
  return VOICE_CHARACTER_PRESETS.map((preset) => ({
    value: preset.id,
    labelHe: preset.labelHe,
    labelEn: preset.labelEn
  }));
}

export function getVoiceCharacterPreset(id?: string | null): VoiceCharacterPreset | undefined {
  if (!id) return undefined;
  return PRESET_BY_ID.get(id as VoiceCharacterId);
}

export function resolveVoiceCharacterPreset(input?: {
  voiceCharacter?: string | null;
  voiceType?: string | null;
} | null): VoiceCharacterPreset | undefined {
  if (!input) return undefined;
  const direct = getVoiceCharacterPreset(String(input.voiceCharacter ?? "").trim());
  if (direct) return direct;
  const type = String(input.voiceType ?? "").trim();
  const fromType = getVoiceCharacterPreset(type);
  if (fromType) return fromType;
  const legacyId = LEGACY_VOICE_TYPE_TO_CHARACTER[type];
  return legacyId ? PRESET_BY_ID.get(legacyId) : undefined;
}

export const MALE_GEMINI_VOICES = [
  "Charon",
  "Puck",
  "Fenrir",
  "Orus",
  "Algenib",
  "Algieba",
  "Enceladus",
  "Iapetus",
  "Rasalgethi",
  "Umbriel"
] as const;

export const FEMALE_GEMINI_VOICES = [
  "Kore",
  "Aoede",
  "Zephyr",
  "Leda",
  "Sulafat",
  "Gacrux",
  "Achernar",
  "Autonoe",
  "Callirrhoe",
  "Despina"
] as const;

const MALE_VOICE_SET = new Set(MALE_GEMINI_VOICES.map((name) => name.toLowerCase()));

export function isMaleGeminiVoice(name: string): boolean {
  return MALE_VOICE_SET.has(name.trim().toLowerCase());
}

export function geminiVoicesForSex(sex: "male" | "female"): readonly string[] {
  return sex === "male" ? MALE_GEMINI_VOICES : FEMALE_GEMINI_VOICES;
}
