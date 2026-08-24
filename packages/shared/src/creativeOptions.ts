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
    /** Narration gender for Gemini TTS (male/female). */
    voiceGender: z.enum(["male", "female"]).optional(),
    voiceType: z.string().max(80).optional(),
    speechStyle: z.string().max(80).optional(),
    speechSpeed: z.string().max(40).optional(),
    musicTempo: z.string().max(40).optional(),
    musicVolumePercent: z.number().int().min(5).max(40).optional(),
    musicSync: z.enum(["auto", "manual"]).optional(),
    logoPlacement: z.enum(["none", "always", "end_only", "open_and_end"]).optional(),
    /** Portrait (9:16) or landscape (16:9) final video. */
    videoOrientation: z.enum(["portrait", "landscape"]).optional(),
    /** Burn karaoke-style Hebrew captions (default on when "on"). */
    karaokeCaptions: z.enum(["on", "off"]).optional(),
    /** Vertical side watermark along the film. */
    sideWatermark: z.enum(["on", "off"]).optional(),
    /** Prefer HeyGen lip-sync render profile for dubbing. */
    preferHeygenDub: z.enum(["on", "off"]).optional(),
    /** Burn per-scene lower-third titles (product / beat name). */
    lowerThirds: z.enum(["on", "off"]).optional(),
    /** Structured film template for script planning. */
    filmTemplate: z.enum(["corporate_product"]).optional()
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

export type CreativeFieldSectionId =
  | "envelope"
  | "brief"
  | "script"
  | "dubbing"
  | "music"
  | "visual"
  | "render";

export type CreativeFieldSection = {
  id: CreativeFieldSectionId;
  titleHe: string;
  fields: CreativeFieldDef[];
};

/** Advanced fields grouped by pipeline stage (shown under «מתקדם»). */
export const CREATIVE_FIELD_SECTIONS: CreativeFieldSection[] = [
  {
    id: "envelope",
    titleHe: "מעטפת התכנית",
    fields: [
      {
        key: "videoOrientation",
        labelHe: "כיוון סרטון",
        kind: "select",
        options: [
          { value: "portrait", labelHe: "לאורך (אנכי)" },
          { value: "landscape", labelHe: "לרוחב (אופקי)" }
        ]
      },
      {
        key: "language",
        labelHe: "שפה",
        kind: "select",
        options: [
          { value: "עברית", labelHe: "עברית" },
          { value: "אנגלית", labelHe: "אנגלית" },
          { value: "צרפתית", labelHe: "צרפתית" },
          { value: "יידיש", labelHe: "יידיש" },
          { value: "אידיש", labelHe: "אידיש" },
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
      }
    ]
  },
  {
    id: "brief",
    titleHe: "בריף",
    fields: [
      {
        key: "designStyle",
        labelHe: "סגנון עיצוב / אנימציה",
        kind: "select",
        options: [
          { value: "מודרני", labelHe: "מודרני" },
          { value: "מינימליסטי", labelHe: "מינימליסטי" },
          { value: "יוקרתי", labelHe: "יוקרתי" },
          { value: "טכנולוגי", labelHe: "טכנולוגי" },
          { value: "צבעוני", labelHe: "צבעוני" },
          { value: "מסורתי", labelHe: "מסורתי" },
          { value: "קומיקס", labelHe: "קומיקס" },
          { value: "קריקטורה", labelHe: "קריקטורה" },
          { value: "ילדותי", labelHe: "ילדותי" },
          { value: "דמויות לגו", labelHe: "דמויות לגו" },
          { value: "אנימציה תלת־ממד", labelHe: "אנימציה תלת־ממד" },
          { value: "סגנון פיקסאר", labelHe: "סגנון פיקסאר" },
          { value: "אנימה", labelHe: "אנימה" },
          { value: "איור וקטורי", labelHe: "איור וקטורי" },
          { value: "סטופ־מושן", labelHe: "סטופ־מושן" },
          { value: "חדשות אולפן", labelHe: "חדשות אולפן" },
          { value: "סרט מוצר B2B", labelHe: "סרט מוצר B2B (תדמית)" }
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
          { value: "שחור־לבן", labelHe: "שחור־לבן" },
          { value: "פסטל ילדותי", labelHe: "פסטל ילדותי" },
          { value: "קומיקס בוהק", labelHe: "קומיקס בוהק" }
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
          { value: "מופשט", labelHe: "מופשט" },
          { value: "תלת־ממד מצויר", labelHe: "תלת־ממד מצויר" },
          { value: "קריקטורה מוגזמת", labelHe: "קריקטורה מוגזמת" }
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
    ]
  },
  {
    id: "script",
    titleHe: "תסריט",
    fields: [
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
          { value: "רקע נקי", labelHe: "רקע נקי" },
          { value: "אולפן חדשות", labelHe: "אולפן חדשות" }
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
          { value: "מומחה", labelHe: "מומחה" },
          { value: "דמות מצוירת", labelHe: "דמות מצוירת" },
          { value: "דמות לגו", labelHe: "דמות לגו" }
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
          { value: "רשמי", labelHe: "רשמי" },
          { value: "צבעוני ילדותי", labelHe: "צבעוני ילדותי" }
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
      }
    ]
  },
  {
    id: "dubbing",
    titleHe: "דיבוב",
    fields: [
      {
        key: "voiceGender",
        labelHe: "קול קריינות",
        kind: "select",
        options: [
          { value: "male", labelHe: "זכר" },
          { value: "female", labelHe: "נקבה" }
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
          { value: "יידיש", labelHe: "יידיש" },
          { value: "אידיש", labelHe: "אידיש" }
        ]
      },
      {
        key: "voiceType",
        labelHe: "סגנון קול",
        kind: "select",
        options: [
          { value: "עמוק", labelHe: "עמוק" },
          { value: "סמכותי", labelHe: "סמכותי" },
          { value: "ידידותי", labelHe: "ידידותי" },
          { value: "צעיר", labelHe: "צעיר" },
          { value: "מבוגר", labelHe: "מבוגר" }
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
      }
    ]
  },
  {
    id: "music",
    titleHe: "מוזיקה",
    fields: [
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
      }
    ]
  },
  {
    id: "visual",
    titleHe: "תמונות וויזואל",
    fields: [
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
      }
    ]
  },
  {
    id: "render",
    titleHe: "רינדור",
    fields: [
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
        key: "karaokeCaptions",
        labelHe: "כתוביות",
        kind: "select",
        options: [
          { value: "on", labelHe: "כן — הצג כתוביות" },
          { value: "off", labelHe: "לא — בלי כתוביות" }
        ]
      },
      {
        key: "sideWatermark",
        labelHe: "ווטרמארק צדדי",
        kind: "select",
        options: [
          { value: "on", labelHe: "פעיל" },
          { value: "off", labelHe: "כבוי" }
        ]
      },
      {
        key: "lowerThirds",
        labelHe: "כותרות תחתונות (lower third)",
        kind: "select",
        options: [
          { value: "on", labelHe: "פעיל — כותרת סצנה / מוצר" },
          { value: "off", labelHe: "כבוי" }
        ]
      },
      {
        key: "preferHeygenDub",
        labelHe: "תנועות שפתיים (HeyGen)",
        kind: "select",
        options: [
          { value: "off", labelHe: "כבוי — כלול בתשלום Prompt2Spot (מומלץ)" },
          { value: "on", labelHe: "פעיל — חיוב נפרד בחשבון HeyGen" }
        ]
      }
    ]
  }
];

export const CREATIVE_FIELD_DEFS: CreativeFieldDef[] = CREATIVE_FIELD_SECTIONS.flatMap((s) => s.fields);

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
    if (key === "voiceGender") {
      lines.push(`${label}: ${value === "male" ? "זכר" : "נקבה"}`);
      continue;
    }
    if (key === "videoOrientation") {
      lines.push(`${label}: ${value === "landscape" ? "לרוחב (16:9)" : "לאורך (9:16)"}`);
      continue;
    }
    if (key === "karaokeCaptions" || key === "sideWatermark" || key === "preferHeygenDub" || key === "lowerThirds") {
      lines.push(`${label}: ${value === "on" ? "פעיל" : "כבוי"}`);
      continue;
    }
    if (key === "filmTemplate") {
      lines.push(`${label}: ${value === "corporate_product" ? "סרט מוצר B2B" : String(value)}`);
      continue;
    }
    if (key === "designStyle") {
      const styleHints: Record<string, string> = {
        קומיקס: "comic-book panels, bold outlines, halftone",
        קריקטורה: "cartoon caricature, exaggerated features",
        ילדותי: "child-friendly illustration, soft shapes",
        "דמויות לגו": "LEGO minifigure characters, brick-built world",
        "אנימציה תלת־ממד": "stylized 3D CGI animation",
        "סגנון פיקסאר": "Pixar-style 3D characters, expressive eyes",
        אנימה: "anime style, clean line art",
        "איור וקטורי": "flat vector illustration",
        "סטופ־מושן": "stop-motion clay/puppet look",
        "חדשות אולפן": "TV news studio desk and plain backdrop — no wall maps, globes, tickers, or graphics overlays",
        "סרט מוצר B2B": "corporate B2B product film — clean product hero shots, office/secure facility, professional VO pacing"
      };
      const hint = styleHints[String(value)];
      lines.push(hint ? `${label}: ${value} (${hint})` : `${label}: ${value}`);
      continue;
    }
    lines.push(`${label}: ${value}`);
  }
  return lines;
}

/** Gemini prebuilt TTS voice from creative gender / style / accent. */
export function geminiVoiceNameFromCreative(creative?: CreativeOptions | null): string | undefined {
  if (!creative) return undefined;
  const gender = creative.voiceGender;
  const type = String(creative.voiceType ?? "");
  const style = String(creative.speechStyle ?? "");
  const accent = String(creative.accent ?? "");
  const hasVoiceHint = Boolean(gender || type || style || accent);
  if (!hasVoiceHint) return undefined;

  const blob = `${type} ${style} ${accent}`.toLowerCase();
  const legacyMale = /זכר|גברי|male/i.test(type);
  const legacyFemale = /נקבה|נשי|female/i.test(type);

  let sex: "male" | "female" =
    gender === "male" || legacyMale
      ? "male"
      : gender === "female" || legacyFemale
        ? "female"
        : /עמוק|סמכותי|מבוגר|חדשותי/.test(blob)
          ? "male"
          : "female";

  return pickGeminiVoiceForSex(sex, blob);
}

function pickGeminiVoiceForSex(sex: "male" | "female", blob: string): string {
  if (sex === "male") {
    if (/צעיר|ידידותי|קליל|puck/i.test(blob)) return "Puck";
    if (/עמוק|סמכותי|דרמטי|fenrir/i.test(blob)) return "Fenrir";
    if (/חדשותי|מבוגר|orus/i.test(blob)) return "Orus";
    return "Charon";
  }
  if (/צעיר|ידידותי|קליל|aoede/i.test(blob)) return "Aoede";
  if (/מרגש|דרמטי|zephyr/i.test(blob)) return "Zephyr";
  if (/רגוע|leda/i.test(blob)) return "Leda";
  return "Kore";
}

const MALE_GEMINI_VOICES = ["Charon", "Puck", "Fenrir", "Orus"] as const;
const FEMALE_GEMINI_VOICES = ["Kore", "Aoede", "Zephyr", "Leda"] as const;

function isMaleGeminiVoice(name: string): boolean {
  return /^(Charon|Puck|Fenrir|Orus)$/i.test(name);
}

/** Infer character sexes from locked cast text (Hebrew/English cues). */
export function inferCastSexesFromBible(characterBible?: string | null): Array<"male" | "female"> {
  const text = characterBible?.trim() ?? "";
  if (!text) return [];
  const chunks = text
    .split(/(?:\n|;|\||(?:^|\s)(?:and|ו|-)\s+|character\s*\d+|דמות\s*\d+)/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 2);
  const sexes: Array<"male" | "female"> = [];
  for (const chunk of chunks.length ? chunks : [text]) {
    const male = /\b(male|man|men|boy|gentleman)\b|זכר|גבר|גברים|בחור|איש\b|נער\b/i.test(chunk);
    const female = /\b(female|woman|women|girl|lady)\b|נקבה|אישה|אשה|נשים|בחורה|ילדה/i.test(chunk);
    if (male && !female) sexes.push("male");
    else if (female && !male) sexes.push("female");
  }
  if (sexes.length >= 2) return sexes;
  const maleHits = (text.match(/\b(male|man|men|boy)\b|זכר|גבר|גברים|בחור/gi) ?? []).length;
  const femaleHits = (text.match(/\b(female|woman|women|girl)\b|נקבה|אישה|אשה|נשים|בחורה/gi) ?? []).length;
  if (maleHits >= 2 && femaleHits === 0) return ["male", "male"];
  if (femaleHits >= 2 && maleHits === 0) return ["female", "female"];
  if (maleHits >= 1 && femaleHits >= 1) return ["male", "female"];
  if (sexes.length === 1) return [sexes[0]!, sexes[0]!];
  return sexes;
}

function pickDifferentGeminiVoice(sex: "male" | "female", exclude: string): string {
  const pool = sex === "male" ? MALE_GEMINI_VOICES : FEMALE_GEMINI_VOICES;
  const alt = pool.find((v) => v.toLowerCase() !== exclude.toLowerCase());
  return alt ?? pickGeminiVoiceForSex(sex, "");
}

/**
 * Primary + secondary TTS voices for alternating dialogue.
 * Matches cast gender from characterBible when possible (two men → two male voices).
 */
export function geminiDialogueVoicePair(
  creative?: CreativeOptions | null,
  characterBible?: string | null
): {
  primary: string;
  secondary: string;
} {
  const primary =
    geminiVoiceNameFromCreative(creative) ?? defaultGeminiVoiceForLanguage(creative?.language ?? null);
  const primarySex: "male" | "female" = isMaleGeminiVoice(primary) ? "male" : "female";
  const cast = inferCastSexesFromBible(characterBible);

  let secondarySex: "male" | "female";
  if (cast.length >= 2) {
    secondarySex = cast[1]!;
  } else if (cast.length === 1) {
    secondarySex = cast[0]!;
  } else if (creative?.voiceGender === "male" || creative?.voiceGender === "female") {
    secondarySex = creative.voiceGender;
  } else {
    // Same sex as primary — opposite-gender pairing was surprising for same-sex casts.
    secondarySex = primarySex;
  }

  const secondary = pickDifferentGeminiVoice(secondarySex, primary);
  return { primary, secondary };
}

/** Spoken delivery hint prepended for Gemini TTS (voice + event/creative tone). */
export function geminiTtsStyleFromCreative(creative?: CreativeOptions | null): string | undefined {
  if (!creative) return undefined;
  const parts: string[] = [];
  if (creative.speechStyle) parts.push(String(creative.speechStyle));
  if (creative.voiceType) parts.push(String(creative.voiceType));
  if (creative.speechSpeed) parts.push(`מהירות: ${creative.speechSpeed}`);
  if (creative.accent) parts.push(`מבטא: ${creative.accent}`);
  if (creative.communicationStyle) parts.push(`טון תקשורת: ${creative.communicationStyle}`);
  if (creative.designStyle) parts.push(`סגנון ויזואלי: ${creative.designStyle}`);
  if (creative.location) parts.push(`מיקום/אירוע: ${creative.location}`);
  if (creative.targetAudience) parts.push(`קהל: ${creative.targetAudience}`);
  if (creative.pace) parts.push(`קצב: ${creative.pace}`);
  if (!parts.length) return undefined;
  return parts.join(", ").slice(0, 480);
}

/** Merge creative TTS style with brief event tone (title / summary / toneOfVoice). */
export function buildTtsDeliveryStyle(input: {
  creative?: CreativeOptions | null;
  title?: string | null;
  summary?: string | null;
  toneOfVoice?: string | null;
  style?: string | null;
}): string | undefined {
  const parts: string[] = [];
  const fromCreative = geminiTtsStyleFromCreative(input.creative);
  if (fromCreative) parts.push(fromCreative);
  if (input.toneOfVoice?.trim()) parts.push(`טון בריף: ${input.toneOfVoice.trim()}`);
  if (input.style?.trim()) parts.push(`סגנון: ${input.style.trim()}`);
  if (input.title?.trim()) parts.push(`נושא: ${input.title.trim()}`);
  if (input.summary?.trim()) parts.push(`תקציר: ${input.summary.trim().slice(0, 160)}`);
  if (!parts.length) return undefined;
  return parts.join(" | ").slice(0, 480);
}

/** Stable default when no creative voice fields — avoid always Kore. */
export function defaultGeminiVoiceForLanguage(language?: string | null): string {
  const lang = String(language ?? "").toLowerCase();
  // Prefer a widely supported female voice for Yiddish/Hebrew-script TTS (Fenrir often triggers OTHER).
  if (lang.startsWith("yi")) return "Aoede";
  if (lang.startsWith("en")) return "Puck";
  return "Aoede";
}

/** Map orientation control to brief aspect ratio. */
export function aspectRatioFromCreative(creative?: CreativeOptions | null): "9:16" | "16:9" | undefined {
  if (creative?.videoOrientation === "landscape") return "16:9";
  if (creative?.videoOrientation === "portrait") return "9:16";
  return undefined;
}

function mapCreativeLanguageLabel(label?: string | null): string | undefined {
  const lang = String(label ?? "").trim();
  if (!lang) return undefined;
  // Yiddish first (אידיש / יידיש) — before Hebrew substring checks.
  if (/ייד|איד|אידיש|yiddish/i.test(lang)) return "yi";
  if (lang.includes("עבר")) return "he";
  if (lang.includes("אנגל")) return "en";
  if (lang.includes("צרפ")) return "fr";
  if (lang.includes("ערב")) return "ar";
  if (lang.includes("רוס")) return "ru";
  if (lang.includes("ספרד")) return "es";
  return undefined;
}

export function languageCodeFromCreative(creative?: CreativeOptions | null): string | undefined {
  return mapCreativeLanguageLabel(creative?.language) ?? mapCreativeLanguageLabel(creative?.accent);
}
