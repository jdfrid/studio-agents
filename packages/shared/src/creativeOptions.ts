import { z } from "zod";

/** Optional advanced creative controls for the create-video form. */
export const CreativeOptionsSchema = z
  .object({
    language: z.string().max(40).optional(),
    targetAudience: z.string().max(80).optional(),
    communicationStyle: z.string().max(80).optional(),
    pace: z.string().max(40).optional(),
    designStyle: z.string().max(80).optional(),
    colorPalette: z.string().max(80).optional(),
    lighting: z.string().max(80).optional(),
    realism: z.string().max(80).optional(),
    location: z.string().max(80).optional(),
    timeOfDay: z.string().max(40).optional(),
    weather: z.string().max(40).optional(),
    characterType: z.string().max(80).optional(),
    ageGroup: z.string().max(40).optional(),
    wardrobe: z.string().max(80).optional(),
    expression: z.string().max(80).optional(),
    action: z.string().max(80).optional(),
    shotType: z.string().max(80).optional(),
    cameraAngle: z.string().max(80).optional(),
    cameraMovement: z.string().max(80).optional(),
    motionSpeed: z.string().max(40).optional(),
    sceneTransition: z.string().max(80).optional(),
    transitionSeconds: z.number().min(0.2).max(2).optional(),
    effects: z.string().max(120).optional(),
    accent: z.string().max(80).optional(),
    voiceType: z.string().max(80).optional(),
    speechStyle: z.string().max(80).optional(),
    speechSpeed: z.string().max(40).optional(),
    musicTempo: z.string().max(40).optional(),
    musicVolumePercent: z.number().int().min(5).max(40).optional(),
    musicSync: z.enum(["auto", "manual"]).optional(),
    logoPlacement: z.enum(["none", "always", "end_only", "open_and_end"]).optional()
  })
  .strict();

export type CreativeOptions = z.infer<typeof CreativeOptionsSchema>;

export type CreativeFieldDef = {
  key: keyof CreativeOptions;
  labelHe: string;
  kind: "select" | "number";
  options?: Array<{ value: string; labelHe: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

export const CREATIVE_FIELD_DEFS: CreativeFieldDef[] = [
  {
    key: "language",
    labelHe: "שפה",
    kind: "select",
    options: [
      { value: "עברית", labelHe: "עברית" },
      { value: "אנגלית", labelHe: "אנגלית" },
      { value: "צרפתית", labelHe: "צרפתית" },
      { value: "יידיש", labelHe: "יידיש" },
      { value: "ערבית", labelHe: "ערבית" },
      { value: "רוסית", labelHe: "רוסית" },
      { value: "ספרדית", labelHe: "ספרדית" }
    ]
  },
  {
    key: "targetAudience",
    labelHe: "קהל יעד",
    kind: "select",
    options: [
      { value: "ילדים", labelHe: "ילדים" },
      { value: "צעירים", labelHe: "צעירים" },
      { value: "משפחות", labelHe: "משפחות" },
      { value: "בעלי עסקים", labelHe: "בעלי עסקים" },
      { value: "תורמים", labelHe: "תורמים" },
      { value: "לקוחות קיימים", labelHe: "לקוחות קיימים" }
    ]
  },
  {
    key: "communicationStyle",
    labelHe: "סגנון תקשורת",
    kind: "select",
    options: [
      { value: "מקצועי", labelHe: "מקצועי" },
      { value: "מרגש", labelHe: "מרגש" },
      { value: "דרמטי", labelHe: "דרמטי" },
      { value: "קליל", labelHe: "קליל" },
      { value: "יוקרתי", labelHe: "יוקרתי" },
      { value: "חדשותי", labelHe: "חדשותי" },
      { value: "ידידותי", labelHe: "ידידותי" }
    ]
  },
  {
    key: "pace",
    labelHe: "קצב",
    kind: "select",
    options: [
      { value: "איטי", labelHe: "איטי" },
      { value: "רגוע", labelHe: "רגוע" },
      { value: "בינוני", labelHe: "בינוני" },
      { value: "מהיר", labelHe: "מהיר" },
      { value: "אנרגטי", labelHe: "אנרגטי" }
    ]
  },
  {
    key: "designStyle",
    labelHe: "סגנון עיצוב",
    kind: "select",
    options: [
      { value: "מודרני", labelHe: "מודרני" },
      { value: "מינימליסטי", labelHe: "מינימליסטי" },
      { value: "יוקרתי", labelHe: "יוקרתי" },
      { value: "טכנולוגי", labelHe: "טכנולוגי" },
      { value: "צבעוני", labelHe: "צבעוני" },
      { value: "מסורתי", labelHe: "מסורתי" }
    ]
  },
  {
    key: "colorPalette",
    labelHe: "צבעוניות",
    kind: "select",
    options: [
      { value: "צבעי מותג", labelHe: "צבעי מותג" },
      { value: "צבעים חמים", labelHe: "צבעים חמים" },
      { value: "צבעים קרים", labelHe: "צבעים קרים" },
      { value: "שחור־לבן", labelHe: "שחור־לבן" }
    ]
  },
  {
    key: "lighting",
    labelHe: "תאורה",
    kind: "select",
    options: [
      { value: "טבעית", labelHe: "טבעית" },
      { value: "אולפן", labelHe: "אולפן" },
      { value: "קולנועית", labelHe: "קולנועית" },
      { value: "בהירה", labelHe: "בהירה" },
      { value: "דרמטית", labelHe: "דרמטית" }
    ]
  },
  {
    key: "realism",
    labelHe: "רמת מציאותיות",
    kind: "select",
    options: [
      { value: "מציאותי", labelHe: "מציאותי" },
      { value: "חצי־מציאותי", labelHe: "חצי־מציאותי" },
      { value: "מאויר", labelHe: "מאויר" },
      { value: "מופשט", labelHe: "מופשט" }
    ]
  },
  {
    key: "location",
    labelHe: "מיקום",
    kind: "select",
    options: [
      { value: "משרד", labelHe: "משרד" },
      { value: "בית", labelHe: "בית" },
      { value: "רחוב", labelHe: "רחוב" },
      { value: "טבע", labelHe: "טבע" },
      { value: "חנות", labelHe: "חנות" },
      { value: "סטודיו", labelHe: "סטודיו" },
      { value: "רקע נקי", labelHe: "רקע נקי" }
    ]
  },
  {
    key: "timeOfDay",
    labelHe: "זמן",
    kind: "select",
    options: [
      { value: "יום", labelHe: "יום" },
      { value: "לילה", labelHe: "לילה" },
      { value: "זריחה", labelHe: "זריחה" },
      { value: "שקיעה", labelHe: "שקיעה" }
    ]
  },
  {
    key: "weather",
    labelHe: "מזג אוויר",
    kind: "select",
    options: [
      { value: "שמש", labelHe: "שמש" },
      { value: "גשם", labelHe: "גשם" },
      { value: "שלג", labelHe: "שלג" },
      { value: "ערפל", labelHe: "ערפל" },
      { value: "ללא השפעה", labelHe: "ללא השפעה" }
    ]
  },
  {
    key: "characterType",
    labelHe: "סוג דמות",
    kind: "select",
    options: [
      { value: "לקוח", labelHe: "לקוח" },
      { value: "עובד", labelHe: "עובד" },
      { value: "בעל עסק", labelHe: "בעל עסק" },
      { value: "קריין", labelHe: "קריין" },
      { value: "מומחה", labelHe: "מומחה" }
    ]
  },
  {
    key: "ageGroup",
    labelHe: "גיל כללי",
    kind: "select",
    options: [
      { value: "ילד", labelHe: "ילד" },
      { value: "צעיר", labelHe: "צעיר" },
      { value: "מבוגר", labelHe: "מבוגר" },
      { value: "קשיש", labelHe: "קשיש" }
    ]
  },
  {
    key: "wardrobe",
    labelHe: "לבוש",
    kind: "select",
    options: [
      { value: "יומיומי", labelHe: "יומיומי" },
      { value: "עסקי", labelHe: "עסקי" },
      { value: "מקצועי", labelHe: "מקצועי" },
      { value: "רשמי", labelHe: "רשמי" }
    ]
  },
  {
    key: "expression",
    labelHe: "הבעה",
    kind: "select",
    options: [
      { value: "שמחה", labelHe: "שמחה" },
      { value: "רצינות", labelHe: "רצינות" },
      { value: "הפתעה", labelHe: "הפתעה" },
      { value: "ביטחון", labelHe: "ביטחון" },
      { value: "התרגשות", labelHe: "התרגשות" }
    ]
  },
  {
    key: "action",
    labelHe: "פעולה",
    kind: "select",
    options: [
      { value: "הליכה", labelHe: "הליכה" },
      { value: "דיבור", labelHe: "דיבור" },
      { value: "עבודה", labelHe: "עבודה" },
      { value: "שימוש במוצר", labelHe: "שימוש במוצר" },
      { value: "הצבעה", labelHe: "הצבעה" }
    ]
  },
  {
    key: "shotType",
    labelHe: "סוג צילום",
    kind: "select",
    options: [
      { value: "תקריב", labelHe: "תקריב" },
      { value: "צילום בינוני", labelHe: "צילום בינוני" },
      { value: "צילום רחב", labelHe: "צילום רחב" },
      { value: "צילום עליון", labelHe: "צילום עליון" }
    ]
  },
  {
    key: "cameraAngle",
    labelHe: "זווית מצלמה",
    kind: "select",
    options: [
      { value: "בגובה העיניים", labelHe: "בגובה העיניים" },
      { value: "מלמעלה", labelHe: "מלמעלה" },
      { value: "מלמטה", labelHe: "מלמטה" },
      { value: "זווית צד", labelHe: "זווית צד" }
    ]
  },
  {
    key: "cameraMovement",
    labelHe: "תנועת מצלמה",
    kind: "select",
    options: [
      { value: "סטטי", labelHe: "סטטי" },
      { value: "זום פנימה", labelHe: "זום פנימה" },
      { value: "זום החוצה", labelHe: "זום החוצה" },
      { value: "מעקב", labelHe: "מעקב" },
      { value: "סיבוב", labelHe: "סיבוב" },
      { value: "תנועה אופקית", labelHe: "תנועה אופקית" }
    ]
  },
  {
    key: "motionSpeed",
    labelHe: "מהירות תנועה",
    kind: "select",
    options: [
      { value: "איטית", labelHe: "איטית" },
      { value: "בינונית", labelHe: "בינונית" },
      { value: "מהירה", labelHe: "מהירה" }
    ]
  },
  {
    key: "sceneTransition",
    labelHe: "מעבר בין סצנות",
    kind: "select",
    options: [
      { value: "חיתוך", labelHe: "חיתוך" },
      { value: "דהייה", labelHe: "דהייה" },
      { value: "החלקה", labelHe: "החלקה" },
      { value: "זום", labelHe: "זום" },
      { value: "הבזק", labelHe: "הבזק" },
      { value: "מעבר תואם תנועה", labelHe: "מעבר תואם תנועה" }
    ]
  },
  {
    key: "transitionSeconds",
    labelHe: "מהירות מעבר (שניות)",
    kind: "number",
    min: 0.2,
    max: 2,
    step: 0.1,
    unit: "שניות"
  },
  {
    key: "effects",
    labelHe: "אפקטים",
    kind: "select",
    options: [
      { value: "חלקיקים", labelHe: "חלקיקים" },
      { value: "אור", labelHe: "אור" },
      { value: "צל", labelHe: "צל" },
      { value: "עשן", labelHe: "עשן" },
      { value: "נצנוץ", labelHe: "נצנוץ" },
      { value: "הדגשת מוצר", labelHe: "הדגשת מוצר" }
    ]
  },
  {
    key: "accent",
    labelHe: "שפה ומבטא",
    kind: "select",
    options: [
      { value: "עברית ישראלית", labelHe: "עברית ישראלית" },
      { value: "אנגלית אמריקאית", labelHe: "אנגלית אמריקאית" },
      { value: "אנגלית בריטית", labelHe: "אנגלית בריטית" },
      { value: "צרפתית", labelHe: "צרפתית" },
      { value: "יידיש", labelHe: "יידיש" }
    ]
  },
  {
    key: "voiceType",
    labelHe: "סוג קול",
    kind: "select",
    options: [
      { value: "גברי", labelHe: "גברי" },
      { value: "צעיר", labelHe: "צעיר" },
      { value: "מבוגר", labelHe: "מבוגר" },
      { value: "עמוק", labelHe: "עמוק" },
      { value: "סמכותי", labelHe: "סמכותי" },
      { value: "ידידותי", labelHe: "ידידותי" }
    ]
  },
  {
    key: "speechStyle",
    labelHe: "סגנון דיבור",
    kind: "select",
    options: [
      { value: "פרסומי", labelHe: "פרסומי" },
      { value: "רגוע", labelHe: "רגוע" },
      { value: "מרגש", labelHe: "מרגש" },
      { value: "חדשותי", labelHe: "חדשותי" },
      { value: "דרמטי", labelHe: "דרמטי" }
    ]
  },
  {
    key: "speechSpeed",
    labelHe: "מהירות דיבור",
    kind: "select",
    options: [
      { value: "איטית", labelHe: "איטית" },
      { value: "רגילה", labelHe: "רגילה" },
      { value: "מהירה", labelHe: "מהירה" }
    ]
  },
  {
    key: "musicTempo",
    labelHe: "קצב מוזיקה",
    kind: "select",
    options: [
      { value: "איטי", labelHe: "איטי" },
      { value: "בינוני", labelHe: "בינוני" },
      { value: "מהיר", labelHe: "מהיר" }
    ]
  },
  {
    key: "musicVolumePercent",
    labelHe: "עוצמת מוזיקה (%)",
    kind: "number",
    min: 5,
    max: 40,
    step: 1,
    unit: "%"
  },
  {
    key: "musicSync",
    labelHe: "התאמה לקצב הסצנות",
    kind: "select",
    options: [
      { value: "auto", labelHe: "אוטומטית" },
      { value: "manual", labelHe: "ידנית" }
    ]
  },
  {
    key: "logoPlacement",
    labelHe: "לוגו",
    kind: "select",
    options: [
      { value: "none", labelHe: "ללא" },
      { value: "always", labelHe: "קבוע" },
      { value: "end_only", labelHe: "רק בסיום" },
      { value: "open_and_end", labelHe: "פתיח וסיום" }
    ]
  }
];

const LABEL_BY_KEY = Object.fromEntries(CREATIVE_FIELD_DEFS.map((f) => [f.key, f.labelHe])) as Record<
  keyof CreativeOptions,
  string
>;

/** Flatten selected creative options into prompt-friendly Hebrew lines for the brief agent. */
export function formatCreativeConstraints(creative?: CreativeOptions | null): string[] {
  if (!creative) return [];
  const lines: string[] = [];
  for (const [key, value] of Object.entries(creative)) {
    if (value == null || value === "") continue;
    const label = LABEL_BY_KEY[key as keyof CreativeOptions] ?? key;
    if (key === "musicVolumePercent") {
      lines.push(`${label}: ${value}% מתחת לקריינות`);
      continue;
    }
    if (key === "musicSync") {
      lines.push(`${label}: ${value === "auto" ? "אוטומטית" : "ידנית"}`);
      continue;
    }
    if (key === "logoPlacement") {
      const map: Record<string, string> = {
        none: "ללא",
        always: "קבוע",
        end_only: "רק בסיום",
        open_and_end: "פתיח וסיום"
      };
      lines.push(`${label}: ${map[String(value)] ?? value}`);
      continue;
    }
    lines.push(`${label}: ${value}`);
  }
  return lines;
}

export function languageCodeFromCreative(creative?: CreativeOptions | null): string | undefined {
  const lang = creative?.language?.trim();
  if (!lang) return undefined;
  if (lang.includes("עבר")) return "he";
  if (lang.includes("אנגל")) return "en";
  if (lang.includes("צרפ")) return "fr";
  if (lang.includes("ייד")) return "yi";
  if (lang.includes("ערב")) return "ar";
  if (lang.includes("רוס")) return "ru";
  if (lang.includes("ספרד")) return "es";
  return undefined;
}
