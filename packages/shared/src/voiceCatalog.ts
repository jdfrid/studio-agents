/** Gemini TTS character catalog — timbre presets, not speaking-style (speechStyle). */

export type VoiceCharacterAge = "adult" | "child" | "baby";

export type VoiceCharacterId =
  | "male_clear"
  | "male_deep"
  | "male_young"
  | "male_gravel"
  | "male_warm"
  | "male_news"
  | "male_friendly"
  | "male_firm"
  | "male_breathy"
  | "male_crisp"
  | "male_lively"
  | "male_teacher"
  | "male_even"
  | "male_casual"
  | "male_excitable"
  | "male_relaxed"
  | "female_clear"
  | "female_soft"
  | "female_bright"
  | "female_mature"
  | "female_warm"
  | "female_young"
  | "female_gentle"
  | "female_easy"
  | "female_smooth"
  | "female_crisp"
  | "female_upbeat"
  | "female_forward"
  | "female_airy"
  | "female_spark"
  | "child_boy"
  | "child_girl"
  | "baby"
  | "funny"
  | "distorted"
  | "formal"
  | "silly"
  | "airport_pa"
  | "hotel_pa"
  | "beach_lifeguard"
  | "retro_radio";

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
    id: "male_friendly",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Achird",
    timbrePrompt: "Friendly adult male, approachable and smiling, conversational",
    labelHe: "גבר — ידידותי",
    labelEn: "Man — friendly"
  },
  {
    id: "male_firm",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Alnilam",
    timbrePrompt: "Firm adult male, steady and decisive, no rush",
    labelHe: "גבר — יציב",
    labelEn: "Man — firm"
  },
  {
    id: "male_breathy",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Enceladus",
    timbrePrompt: "Breathy adult male, soft and close, quiet intensity",
    labelHe: "גבר — לוחש",
    labelEn: "Man — breathy"
  },
  {
    id: "male_crisp",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Iapetus",
    timbrePrompt: "Crisp adult male, clean articulation, bright mid voice",
    labelHe: "גבר — צלול",
    labelEn: "Man — crisp"
  },
  {
    id: "male_lively",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Sadachbia",
    timbrePrompt: "Lively adult male, quick energy, upbeat but still an adult",
    labelHe: "גבר — חי",
    labelEn: "Man — lively"
  },
  {
    id: "male_teacher",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Sadaltager",
    timbrePrompt: "Knowledgeable adult male explainer, patient and clear, teacher cadence",
    labelHe: "גבר — מסביר",
    labelEn: "Man — explainer"
  },
  {
    id: "male_even",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Schedar",
    timbrePrompt: "Even adult male, neutral and balanced, no theatrical color",
    labelHe: "גבר — אחיד",
    labelEn: "Man — even"
  },
  {
    id: "male_casual",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Zubenelgenubi",
    timbrePrompt: "Casual adult male, everyday and relaxed, not an announcer",
    labelHe: "גבר — יומיומי",
    labelEn: "Man — casual"
  },
  {
    id: "male_excitable",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Fenrir",
    timbrePrompt: "Excitable adult male, high energy, eager and forward",
    labelHe: "גבר — נלהב",
    labelEn: "Man — excitable"
  },
  {
    id: "male_relaxed",
    group: "adult_male",
    sex: "male",
    age: "adult",
    geminiVoice: "Umbriel",
    timbrePrompt: "Easy-going adult male, unhurried and mellow",
    labelHe: "גבר — רגוע",
    labelEn: "Man — relaxed"
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
    id: "female_gentle",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Vindemiatrix",
    timbrePrompt: "Gentle adult female, soft and careful, never sharp",
    labelHe: "אישה — עדינה",
    labelEn: "Woman — gentle"
  },
  {
    id: "female_easy",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Callirrhoe",
    timbrePrompt: "Easy-going adult female, relaxed and unforced",
    labelHe: "אישה — נינוחה",
    labelEn: "Woman — easy-going"
  },
  {
    id: "female_smooth",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Despina",
    timbrePrompt: "Smooth adult female, polished and even, studio narrator",
    labelHe: "אישה — חלקה",
    labelEn: "Woman — smooth"
  },
  {
    id: "female_crisp",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Erinome",
    timbrePrompt: "Crisp adult female, clean diction, bright and precise",
    labelHe: "אישה — צלולה",
    labelEn: "Woman — crisp"
  },
  {
    id: "female_upbeat",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Laomedeia",
    timbrePrompt: "Upbeat adult female, cheerful and forward, still clear",
    labelHe: "אישה — עולצת",
    labelEn: "Woman — upbeat"
  },
  {
    id: "female_forward",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Pulcherrima",
    timbrePrompt: "Forward adult female, present and confident, close to the mic",
    labelHe: "אישה — בולטת",
    labelEn: "Woman — forward"
  },
  {
    id: "female_airy",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Achernar",
    timbrePrompt: "Soft airy adult female, light and quiet, not whispery to the point of loss",
    labelHe: "אישה — אוורירית",
    labelEn: "Woman — airy"
  },
  {
    id: "female_spark",
    group: "adult_female",
    sex: "female",
    age: "adult",
    geminiVoice: "Autonoe",
    timbrePrompt: "Bright sparkling adult female, lively and clear",
    labelHe: "אישה — נוצצת",
    labelEn: "Woman — sparkling"
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
  },
  {
    id: "airport_pa",
    group: "character",
    sex: "male",
    age: "adult",
    geminiVoice: "Orus",
    timbrePrompt:
      "Airport public-address announcer over a terminal PA speaker, slightly distant and reverberant, measured gate-style cadence, very clear diction",
    labelHe: "כרוז בשדה התעופה",
    labelEn: "Airport PA announcer"
  },
  {
    id: "hotel_pa",
    group: "character",
    sex: "male",
    age: "adult",
    geminiVoice: "Algieba",
    timbrePrompt:
      "Hotel lobby public-address announcer, warm hospitality, polite and unhurried, slight indoor PA reverb",
    labelHe: "כרוז בבית מלון",
    labelEn: "Hotel PA announcer"
  },
  {
    id: "beach_lifeguard",
    group: "character",
    sex: "male",
    age: "adult",
    geminiVoice: "Fenrir",
    timbrePrompt:
      "Beach lifeguard calling over open sand, outdoor projection, sun-bleached and energetic, megaphone-like presence without unintelligible shouting",
    labelHe: "מציל בחוף הים",
    labelEn: "Beach lifeguard"
  },
  {
    id: "retro_radio",
    group: "character",
    sex: "male",
    age: "adult",
    geminiVoice: "Umbriel",
    timbrePrompt:
      "1950s–60s retro radio announcer, warm tube-amp color, vintage broadcast cadence, slightly over-enunciated commercial charm",
    labelHe: "קול רדיו רטרו",
    labelEn: "Retro radio voice"
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

/** All 30 Gemini prebuilt TTS voices. https://ai.google.dev/gemini-api/docs/speech-generation */
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
  "Umbriel",
  "Achird",
  "Alnilam",
  "Sadachbia",
  "Sadaltager",
  "Schedar",
  "Zubenelgenubi"
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
  "Despina",
  "Erinome",
  "Laomedeia",
  "Pulcherrima",
  "Vindemiatrix"
] as const;

const MALE_VOICE_SET = new Set(MALE_GEMINI_VOICES.map((name) => name.toLowerCase()));

export function isMaleGeminiVoice(name: string): boolean {
  return MALE_VOICE_SET.has(name.trim().toLowerCase());
}

export function geminiVoicesForSex(sex: "male" | "female"): readonly string[] {
  return sex === "male" ? MALE_GEMINI_VOICES : FEMALE_GEMINI_VOICES;
}
