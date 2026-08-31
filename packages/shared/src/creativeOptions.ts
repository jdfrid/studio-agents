import { z } from "zod";
import type { Locale } from "./localization.js";

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
    /** Safe, renderer-owned subtitle styling choices (never raw FFmpeg/ASS fragments). */
    subtitlePosition: z.enum(["top", "middle", "bottom"]).optional(),
    subtitleSize: z.enum(["small", "medium", "large"]).optional(),
    subtitleFont: z.enum(["noto_sans", "noto_serif", "dejavu_sans"]).optional(),
    subtitleRotation: z.enum(["-8", "0", "8"]).optional(),
    subtitleEffect: z.enum(["none", "outline", "shadow", "background"]).optional(),
    /** Vertical side watermark along the film. */
    sideWatermark: z.enum(["on", "off"]).optional(),
    /** Prefer HeyGen lip-sync render profile for dubbing. */
    preferHeygenDub: z.enum(["on", "off"]).optional(),
    /** Burn per-scene lower-third titles (product / beat name). */
    lowerThirds: z.enum(["on", "off"]).optional(),
    /** Structured film template for script planning. */
    filmTemplate: z
      .enum([
        "corporate_product",
        "social_explainer",
        "public_service_explainer",
        "product_demo",
        "testimonial"
      ])
      .optional()
  })
  .strict();

export type CreativeOptions = z.infer<typeof CreativeOptionsSchema>;

export type CreativeFieldDef = {
  key: keyof CreativeOptions;
  labelHe: string;
  /** English display label; optional only for source compatibility with older consumers. */
  labelEn?: string;
  kind: "select" | "number";
  options?: Array<{ value: string; labelHe: string; labelEn?: string; code?: string }>;
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
  /** English display title; optional only for source compatibility with older consumers. */
  titleEn?: string;
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
          { value: "ידידותי", labelHe: "ידידותי" },
          { value: "הסברתי", labelHe: "הסברתי" },
          { value: "חינוכי", labelHe: "חינוכי" },
          { value: "שיחתי", labelHe: "שיחתי וטבעי" },
          { value: "משכנע", labelHe: "משכנע ומכירתי" },
          { value: "אמפתי", labelHe: "אמפתי" },
          { value: "הומוריסטי", labelHe: "הומוריסטי" },
          { value: "מעורר השראה", labelHe: "מעורר השראה" },
          { value: "ישיר", labelHe: "ישיר ותכליתי" },
          { value: "שירות ציבורי", labelHe: "שירות ציבורי" },
          { value: "סיפור אישי", labelHe: "סיפור אישי" }
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
          { value: "סרט מוצר B2B", labelHe: "סרט מוצר B2B (תדמית)" },
          { value: "אנימציה תלת־ממד משפחתית", labelHe: "אנימציה תלת־ממד משפחתית" },
          { value: "אנימציה דו־ממד", labelHe: "אנימציה דו־ממד" },
          { value: "סרט קולנועי", labelHe: "סרט קולנועי" },
          { value: "דוקומנטרי", labelHe: "דוקומנטרי" },
          { value: "UGC אותנטי", labelHe: "UGC אותנטי / צילום טלפון" },
          { value: "לייף סטייל", labelHe: "לייף סטייל" },
          { value: "סרטון הסברה", labelHe: "סרטון הסברה" },
          { value: "הדגמת מוצר", labelHe: "הדגמת מוצר" },
          { value: "קליימיישן", labelHe: "קליימיישן / פלסטלינה" },
          { value: "גזירי נייר", labelHe: "גזירי נייר" },
          { value: "איזומטרי", labelHe: "איור איזומטרי" },
          { value: "רטרו", labelHe: "רטרו" },
          { value: "סוריאליסטי", labelHe: "סוריאליסטי" },
          { value: "עריכת מגזין", labelHe: "עריכת מגזין יוקרתית" }
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
          { value: "קומיקס בוהק", labelHe: "קומיקס בוהק" },
          { value: "פסטל רך", labelHe: "פסטל רך" },
          { value: "קונטרסט גבוה", labelHe: "קונטרסט גבוה" },
          { value: "טבעית", labelHe: "צבעוניות טבעית" },
          { value: "אדמתית", labelHe: "גוונים אדמתיים" },
          { value: "ניאון", labelHe: "ניאון" },
          { value: "כהה קולנועית", labelHe: "כהה קולנועית" },
          { value: "טורקיז וכתום", labelHe: "טורקיז וכתום קולנועי" },
          { value: "מונוכרומטית", labelHe: "מונוכרומטית" },
          { value: "צבעי יסוד", labelHe: "צבעי יסוד" },
          { value: "בהירה ונקייה", labelHe: "בהירה ונקייה" }
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
          { value: "קריקטורה מוגזמת", labelHe: "קריקטורה מוגזמת" },
          { value: "פוטוריאליסטי", labelHe: "פוטוריאליסטי" },
          { value: "היפר־ריאליסטי", labelHe: "היפר־ריאליסטי" },
          { value: "תלת־ממד ריאליסטי", labelHe: "תלת־ממד ריאליסטי" },
          { value: "תלת־ממד מסוגנן", labelHe: "תלת־ממד מסוגנן" },
          { value: "איור דו־ממד", labelHe: "איור דו־ממד" },
          { value: "צילום UGC", labelHe: "צילום UGC טבעי" },
          { value: "דוקומנטרי טבעי", labelHe: "דוקומנטרי טבעי" },
          { value: "סינמטי מסוגנן", labelHe: "סינמטי מסוגנן" }
        ]
      },
      {
        key: "filmTemplate",
        labelHe: "מבנה הסרטון",
        kind: "select",
        options: [
          { value: "social_explainer", labelHe: "סרטון הסברה לרשתות" },
          { value: "public_service_explainer", labelHe: "הסברה / שירות ציבורי" },
          { value: "product_demo", labelHe: "בעיה → הדגמת מוצר → פתרון" },
          { value: "testimonial", labelHe: "עדות / סיפור לקוח" },
          { value: "corporate_product", labelHe: "סרט מוצר B2B" }
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
          { value: "דמות לגו", labelHe: "דמות לגו" },
          { value: "ילד", labelHe: "ילד / ילדה" },
          { value: "הורה", labelHe: "הורה" },
          { value: "מורה", labelHe: "מורה" },
          { value: "תלמיד", labelHe: "תלמיד" },
          { value: "רופא", labelHe: "רופא / מטפל" },
          { value: "משפיען", labelHe: "משפיען / יוצר תוכן" },
          { value: "מגיש", labelHe: "מגיש" },
          { value: "קמע מותג", labelHe: "קמע מותג" },
          { value: "משפחה", labelHe: "משפחה" },
          { value: "זוג", labelHe: "זוג" },
          { value: "צוות", labelHe: "צוות" },
          { value: "ללא דמות", labelHe: "ללא דמות — מוצר בלבד" }
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
          { value: "צבעוני ילדותי", labelHe: "צבעוני ילדותי" },
          { value: "קז׳ואל אלגנטי", labelHe: "קז׳ואל אלגנטי" },
          { value: "ספורטיבי", labelHe: "ספורטיבי" },
          { value: "מדי עבודה", labelHe: "מדי עבודה" },
          { value: "מדים רפואיים", labelHe: "מדים רפואיים" },
          { value: "אופנתי", labelHe: "אופנתי" },
          { value: "יוקרתי", labelHe: "יוקרתי" },
          { value: "מסורתי", labelHe: "מסורתי" },
          { value: "עתידני", labelHe: "עתידני" },
          { value: "בגדי בית", labelHe: "בגדי בית" },
          { value: "בהתאם לתמונת המקור", labelHe: "זהה לתמונת המקור" }
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
          { value: "התרגשות", labelHe: "התרגשות" },
          { value: "דאגה", labelHe: "דאגה" },
          { value: "בלבול", labelHe: "בלבול" },
          { value: "הקלה", labelHe: "הקלה" },
          { value: "אמפתיה", labelHe: "אמפתיה" },
          { value: "התלהבות", labelHe: "התלהבות" },
          { value: "אמון", labelHe: "אמון" },
          { value: "סקרנות", labelHe: "סקרנות" },
          { value: "רוגע", labelHe: "רוגע" },
          { value: "נחישות", labelHe: "נחישות" },
          { value: "טבעית ועדינה", labelHe: "טבעית ועדינה" }
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
          { value: "הצבעה", labelHe: "הצבעה" },
          { value: "השוואת מוצרים", labelHe: "השוואת מוצרים" },
          { value: "הדגמה", labelHe: "הדגמה" },
          { value: "בדיקה", labelHe: "בדיקה / בחינה" },
          { value: "בחירה", labelHe: "בחירה" },
          { value: "פתיחת אריזה", labelHe: "פתיחת אריזה" },
          { value: "הרכבה", labelHe: "הרכבה" },
          { value: "שיחה", labelHe: "שיחה בין דמויות" },
          { value: "הצגת נתון", labelHe: "הצגת נתון" },
          { value: "לפני ואחרי", labelHe: "לפני ואחרי" },
          { value: "פתרון בעיה", labelHe: "פתרון בעיה" },
          { value: "צילום מוצר", labelHe: "צילום מוצר בלבד" }
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
          { value: "מבוגר", labelHe: "מבוגר" },
          { value: "חם", labelHe: "חם ונעים" },
          { value: "רך", labelHe: "רך ומרגיע" },
          { value: "אנרגטי", labelHe: "אנרגטי" },
          { value: "טבעי", labelHe: "טבעי ולא פרסומי" },
          { value: "מספר סיפורים", labelHe: "מספר סיפורים" },
          { value: "רשמי", labelHe: "רשמי / ממלכתי" },
          { value: "רדיופוני", labelHe: "רדיופוני" },
          { value: "קרוב ואישי", labelHe: "קרוב ואישי" },
          { value: "טכנולוגי", labelHe: "טכנולוגי" }
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
          { value: "דרמטי", labelHe: "דרמטי" },
          { value: "הסברתי", labelHe: "הסברתי" },
          { value: "חינוכי", labelHe: "חינוכי" },
          { value: "שיחתי", labelHe: "שיחתי וטבעי" },
          { value: "הומוריסטי", labelHe: "הומוריסטי" },
          { value: "משכנע", labelHe: "משכנע" },
          { value: "אמפתי", labelHe: "אמפתי" },
          { value: "דוקומנטרי", labelHe: "דוקומנטרי" },
          { value: "סיפור אישי", labelHe: "סיפור אישי" },
          { value: "מהיר לרשתות", labelHe: "מהיר לרשתות" },
          { value: "שירות ציבורי", labelHe: "שירות ציבורי / ממלכתי" }
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
          { value: "הדגשת מוצר", labelHe: "הדגשת מוצר" },
          { value: "ללא אפקטים", labelHe: "ללא אפקטים" },
          { value: "עומק שדה", labelHe: "עומק שדה" },
          { value: "בוקה", labelHe: "בוקה" },
          { value: "קרני אור", labelHe: "קרני אור" },
          { value: "פרלקסה", labelHe: "פרלקסה" },
          { value: "גרפיקה בתנועה", labelHe: "גרפיקה בתנועה" },
          { value: "אייקונים מרחפים", labelHe: "אייקונים מרחפים" },
          { value: "קווי מהירות", labelHe: "קווי מהירות" },
          { value: "גליץ׳ דיגיטלי", labelHe: "גליץ׳ דיגיטלי" },
          { value: "פילם גריין", labelHe: "פילם גריין" },
          { value: "הילוך איטי", labelHe: "הילוך איטי" },
          { value: "טיים־לאפס", labelHe: "טיים־לאפס" },
          { value: "מסך מפוצל", labelHe: "מסך מפוצל" }
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
        key: "subtitlePosition",
        labelHe: "מיקום כתוביות",
        kind: "select",
        options: [
          { value: "top", labelHe: "למעלה" },
          { value: "middle", labelHe: "במרכז" },
          { value: "bottom", labelHe: "למטה" }
        ]
      },
      {
        key: "subtitleSize",
        labelHe: "גודל כתוביות",
        kind: "select",
        options: [
          { value: "small", labelHe: "קטן" },
          { value: "medium", labelHe: "בינוני" },
          { value: "large", labelHe: "גדול" }
        ]
      },
      {
        key: "subtitleFont",
        labelHe: "גופן כתוביות",
        kind: "select",
        options: [
          { value: "noto_sans", labelHe: "Noto Sans — נקי" },
          { value: "noto_serif", labelHe: "Noto Serif — קלאסי" },
          { value: "dejavu_sans", labelHe: "DejaVu Sans — פשוט" }
        ]
      },
      {
        key: "subtitleRotation",
        labelHe: "זווית כתוביות",
        kind: "select",
        options: [
          { value: "-8", labelHe: "נטייה שמאלה" },
          { value: "0", labelHe: "ישר" },
          { value: "8", labelHe: "נטייה ימינה" }
        ]
      },
      {
        key: "subtitleEffect",
        labelHe: "אפקט טקסט",
        kind: "select",
        options: [
          { value: "none", labelHe: "ללא אפקט" },
          { value: "outline", labelHe: "קו מתאר" },
          { value: "shadow", labelHe: "צל" },
          { value: "background", labelHe: "רקע כהה" }
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
        labelHe: "תנועות שפתיים (Kling Avatar)",
        kind: "select",
        options: [
          { value: "off", labelHe: "כבוי — דיבוב TTS על וידאו (מומלץ)" },
          { value: "on", labelHe: "פעיל — סנכרון שפתיים דרך fal (~$0.056/ש׳)" }
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

const SECTION_TITLE_EN: Record<CreativeFieldSectionId, string> = {
  envelope: "Program setup",
  brief: "Brief",
  script: "Script",
  dubbing: "Dubbing",
  music: "Music",
  visual: "Images and visuals",
  render: "Rendering"
};

const FIELD_LABEL_EN: Record<keyof CreativeOptions, string> = {
  language: "Language",
  targetAudience: "Target audience",
  communicationStyle: "Communication style",
  pace: "Pace",
  designStyle: "Design / animation style",
  colorPalette: "Color palette",
  lighting: "Lighting",
  realism: "Realism",
  location: "Location",
  timeOfDay: "Time of day",
  weather: "Weather",
  characterType: "Character type",
  ageGroup: "Age group",
  wardrobe: "Wardrobe",
  expression: "Expression",
  action: "Action",
  shotType: "Shot type",
  cameraAngle: "Camera angle",
  cameraMovement: "Camera movement",
  motionSpeed: "Motion speed",
  sceneTransition: "Scene transition",
  transitionSeconds: "Transition speed (seconds)",
  effects: "Effects",
  accent: "Language and accent",
  voiceGender: "Narration voice",
  voiceType: "Voice style",
  speechStyle: "Speaking style",
  speechSpeed: "Speaking speed",
  musicTempo: "Music tempo",
  musicVolumePercent: "Music volume (%)",
  musicSync: "Sync to scene pace",
  logoPlacement: "Logo",
  videoOrientation: "Video orientation",
  karaokeCaptions: "Captions",
  subtitlePosition: "Caption position",
  subtitleSize: "Caption size",
  subtitleFont: "Caption font",
  subtitleRotation: "Caption angle",
  subtitleEffect: "Text effect",
  sideWatermark: "Side watermark",
  preferHeygenDub: "Lip sync (Kling Avatar)",
  lowerThirds: "Lower thirds",
  filmTemplate: "Video structure"
};

/** Shared option translations. Keyed by the existing Hebrew display label/value. */
const OPTION_LABEL_EN_BY_HE: Record<string, string> = {
  עברית: "Hebrew",
  אנגלית: "English",
  צרפתית: "French",
  יידיש: "Yiddish",
  אידיש: "Yiddish",
  ערבית: "Arabic",
  רוסית: "Russian",
  ספרדית: "Spanish",
  ילדים: "Children",
  צעירים: "Young adults",
  משפחות: "Families",
  "בעלי עסקים": "Business owners",
  תורמים: "Donors",
  "לקוחות קיימים": "Existing customers",
  מקצועי: "Professional",
  מרגש: "Emotional",
  דרמטי: "Dramatic",
  קליל: "Light",
  יוקרתי: "Premium",
  חדשותי: "News-style",
  ידידותי: "Friendly",
  הסברתי: "Explanatory",
  חינוכי: "Educational",
  "שיחתי וטבעי": "Conversational and natural",
  "משכנע ומכירתי": "Persuasive and sales-focused",
  אמפתי: "Empathetic",
  הומוריסטי: "Humorous",
  "מעורר השראה": "Inspirational",
  "ישיר ותכליתי": "Direct and focused",
  "שירות ציבורי": "Public service",
  "סיפור אישי": "Personal story",
  איטי: "Slow",
  רגוע: "Calm",
  בינוני: "Medium",
  מהיר: "Fast",
  אנרגטי: "Energetic",
  מודרני: "Modern",
  מינימליסטי: "Minimalist",
  טכנולוגי: "Technology",
  צבעוני: "Colorful",
  מסורתי: "Traditional",
  קומיקס: "Comic book",
  קריקטורה: "Cartoon caricature",
  ילדותי: "Child-friendly",
  "דמויות לגו": "LEGO characters",
  "אנימציה תלת־ממד": "3D animation",
  "סגנון פיקסאר": "Pixar-style",
  אנימה: "Anime",
  "איור וקטורי": "Vector illustration",
  "סטופ־מושן": "Stop motion",
  "חדשות אולפן": "Studio news",
  "סרט מוצר B2B (תדמית)": "B2B product film",
  "אנימציה תלת־ממד משפחתית": "Family-friendly 3D animation",
  "אנימציה דו־ממד": "2D animation",
  "סרט קולנועי": "Cinematic film",
  דוקומנטרי: "Documentary",
  "UGC אותנטי / צילום טלפון": "Authentic UGC / phone video",
  "לייף סטייל": "Lifestyle",
  "סרטון הסברה": "Explainer video",
  "הדגמת מוצר": "Product demonstration",
  "קליימיישן / פלסטלינה": "Claymation",
  "גזירי נייר": "Paper cutout",
  "איור איזומטרי": "Isometric illustration",
  רטרו: "Retro",
  סוריאליסטי: "Surreal",
  "עריכת מגזין יוקרתית": "Premium editorial",
  "צבעי מותג": "Brand colors",
  "צבעים חמים": "Warm colors",
  "צבעים קרים": "Cool colors",
  "שחור־לבן": "Black and white",
  "פסטל ילדותי": "Child-friendly pastel",
  "קומיקס בוהק": "Bright comic colors",
  "פסטל רך": "Soft pastel",
  "קונטרסט גבוה": "High contrast",
  "צבעוניות טבעית": "Natural colors",
  "גוונים אדמתיים": "Earth tones",
  ניאון: "Neon",
  "כהה קולנועית": "Dark cinematic",
  "טורקיז וכתום קולנועי": "Cinematic teal and orange",
  מונוכרומטית: "Monochrome",
  "צבעי יסוד": "Primary colors",
  "בהירה ונקייה": "Bright and clean",
  מציאותי: "Realistic",
  "חצי־מציאותי": "Semi-realistic",
  מאויר: "Illustrated",
  מופשט: "Abstract",
  "תלת־ממד מצויר": "Cartoon 3D",
  "קריקטורה מוגזמת": "Exaggerated caricature",
  פוטוריאליסטי: "Photorealistic",
  "היפר־ריאליסטי": "Hyper-realistic",
  "תלת־ממד ריאליסטי": "Realistic 3D",
  "תלת־ממד מסוגנן": "Stylized 3D",
  "איור דו־ממד": "2D illustration",
  "צילום UGC טבעי": "Natural UGC footage",
  "דוקומנטרי טבעי": "Natural documentary",
  "סינמטי מסוגנן": "Stylized cinematic",
  "סרטון הסברה לרשתות": "Social media explainer",
  "הסברה / שירות ציבורי": "Public-service explainer",
  "בעיה → הדגמת מוצר → פתרון": "Problem → product demo → solution",
  "עדות / סיפור לקוח": "Testimonial / customer story",
  "סרט מוצר B2B": "B2B product film",
  ללא: "None",
  קבוע: "Always",
  "רק בסיום": "End only",
  "פתיח וסיום": "Opening and ending",
  משרד: "Office",
  בית: "Home",
  רחוב: "Street",
  טבע: "Nature",
  חנות: "Store",
  סטודיו: "Studio",
  "רקע נקי": "Clean background",
  "אולפן חדשות": "News studio",
  יום: "Day",
  לילה: "Night",
  זריחה: "Sunrise",
  שקיעה: "Sunset",
  שמש: "Sunny",
  גשם: "Rain",
  שלג: "Snow",
  ערפל: "Fog",
  "ללא השפעה": "No effect",
  לקוח: "Customer",
  עובד: "Employee",
  "בעל עסק": "Business owner",
  קריין: "Narrator",
  מומחה: "Expert",
  "דמות מצוירת": "Animated character",
  "דמות לגו": "LEGO character",
  "ילד / ילדה": "Child",
  הורה: "Parent",
  מורה: "Teacher",
  תלמיד: "Student",
  "רופא / מטפל": "Doctor / therapist",
  "משפיען / יוצר תוכן": "Influencer / creator",
  מגיש: "Presenter",
  "קמע מותג": "Brand mascot",
  משפחה: "Family",
  זוג: "Couple",
  צוות: "Team",
  "ללא דמות — מוצר בלבד": "No character — product only",
  ילד: "Child",
  צעיר: "Young",
  מבוגר: "Adult",
  קשיש: "Senior",
  יומיומי: "Casual",
  עסקי: "Business",
  רשמי: "Formal",
  "צבעוני ילדותי": "Colorful and child-friendly",
  "קז׳ואל אלגנטי": "Smart casual",
  ספורטיבי: "Sporty",
  "מדי עבודה": "Workwear",
  "מדים רפואיים": "Medical uniform",
  אופנתי: "Fashionable",
  עתידני: "Futuristic",
  "בגדי בית": "Homewear",
  "זהה לתמונת המקור": "Match source image",
  שמחה: "Happy",
  רצינות: "Serious",
  הפתעה: "Surprised",
  ביטחון: "Confident",
  התרגשות: "Excited",
  דאגה: "Concerned",
  בלבול: "Confused",
  הקלה: "Relieved",
  אמפתיה: "Empathetic",
  התלהבות: "Enthusiastic",
  אמון: "Trusting",
  סקרנות: "Curious",
  רוגע: "Relaxed",
  נחישות: "Determined",
  "טבעית ועדינה": "Natural and subtle",
  הליכה: "Walking",
  דיבור: "Speaking",
  עבודה: "Working",
  "שימוש במוצר": "Using the product",
  הצבעה: "Pointing",
  "השוואת מוצרים": "Comparing products",
  הדגמה: "Demonstrating",
  "בדיקה / בחינה": "Inspecting",
  בחירה: "Choosing",
  "פתיחת אריזה": "Unboxing",
  הרכבה: "Assembling",
  "שיחה בין דמויות": "Character conversation",
  "הצגת נתון": "Presenting a fact",
  "לפני ואחרי": "Before and after",
  "פתרון בעיה": "Solving a problem",
  "צילום מוצר בלבד": "Product-only shot",
  זכר: "Male",
  נקבה: "Female",
  "עברית ישראלית": "Israeli Hebrew",
  "אנגלית אמריקאית": "American English",
  "אנגלית בריטית": "British English",
  עמוק: "Deep",
  סמכותי: "Authoritative",
  "חם ונעים": "Warm and pleasant",
  "רך ומרגיע": "Soft and soothing",
  "טבעי ולא פרסומי": "Natural, not commercial",
  "מספר סיפורים": "Storyteller",
  "רשמי / ממלכתי": "Formal / official",
  רדיופוני: "Radio-style",
  "קרוב ואישי": "Close and personal",
  פרסומי: "Commercial",
  משכנע: "Persuasive",
  "מהיר לרשתות": "Fast social-media style",
  "שירות ציבורי / ממלכתי": "Public service / official",
  איטית: "Slow",
  רגילה: "Normal",
  מהירה: "Fast",
  אוטומטית: "Automatic",
  ידנית: "Manual",
  טבעית: "Natural",
  אולפן: "Studio",
  קולנועית: "Cinematic",
  בהירה: "Bright",
  דרמטית: "Dramatic",
  תקריב: "Close-up",
  "צילום בינוני": "Medium shot",
  "צילום רחב": "Wide shot",
  "צילום עליון": "Top shot",
  "בגובה העיניים": "Eye level",
  מלמעלה: "High angle",
  מלמטה: "Low angle",
  "זווית צד": "Side angle",
  סטטי: "Static",
  "זום פנימה": "Zoom in",
  "זום החוצה": "Zoom out",
  מעקב: "Tracking",
  סיבוב: "Orbit",
  "תנועה אופקית": "Pan",
  בינונית: "Medium",
  חלקיקים: "Particles",
  אור: "Light",
  צל: "Shadow",
  עשן: "Smoke",
  נצנוץ: "Sparkle",
  "הדגשת מוצר": "Product highlight",
  "ללא אפקטים": "No effects",
  "עומק שדה": "Depth of field",
  בוקה: "Bokeh",
  "קרני אור": "Light rays",
  פרלקסה: "Parallax",
  "גרפיקה בתנועה": "Motion graphics",
  "אייקונים מרחפים": "Floating icons",
  "קווי מהירות": "Speed lines",
  "גליץ׳ דיגיטלי": "Digital glitch",
  "פילם גריין": "Film grain",
  "הילוך איטי": "Slow motion",
  "טיים־לאפס": "Time-lapse",
  "מסך מפוצל": "Split screen",
  חיתוך: "Cut",
  דהייה: "Fade",
  החלקה: "Slide",
  זום: "Zoom",
  הבזק: "Flash",
  "מעבר תואם תנועה": "Match-motion transition",
  "כן — הצג כתוביות": "On — show captions",
  "לא — בלי כתוביות": "Off — no captions",
  פעיל: "On",
  כבוי: "Off",
  "פעיל — כותרת סצנה / מוצר": "On — scene / product title",
  "כבוי — דיבוב TTS על וידאו (מומלץ)": "Off — TTS dubbing over video (recommended)",
  "פעיל — סנכרון שפתיים דרך fal (~$0.056/ש׳)": "On — lip sync via fal (~$0.056/s)",
  "לאורך (אנכי)": "Portrait",
  "לרוחב (אופקי)": "Landscape",
  למעלה: "Top",
  במרכז: "Middle",
  למטה: "Bottom",
  קטן: "Small",
  גדול: "Large",
  "Noto Sans — נקי": "Noto Sans — clean",
  "Noto Serif — קלאסי": "Noto Serif — classic",
  "DejaVu Sans — פשוט": "DejaVu Sans — simple",
  "נטייה שמאלה": "Tilt left",
  ישר: "Straight",
  "נטייה ימינה": "Tilt right",
  "ללא אפקט": "No effect",
  "קו מתאר": "Outline",
  "רקע כהה": "Dark background"
};

function stableOptionCode(key: keyof CreativeOptions, value: string, labelEn: string): string {
  if (/^[a-z][a-z0-9_]*$/i.test(value)) return value.toLowerCase();
  const slug = labelEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (slug) return slug;
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${key}_${(hash >>> 0).toString(36)}`;
}

for (const section of CREATIVE_FIELD_SECTIONS) {
  section.titleEn = SECTION_TITLE_EN[section.id];
  for (const field of section.fields) {
    field.labelEn = FIELD_LABEL_EN[field.key];
    for (const option of field.options ?? []) {
      option.labelEn =
        OPTION_LABEL_EN_BY_HE[option.labelHe] ??
        OPTION_LABEL_EN_BY_HE[option.value] ??
        (/^[\x20-\x7E]+$/.test(option.labelHe) ? option.labelHe : option.value);
      option.code = stableOptionCode(field.key, option.value, option.labelEn);
    }
  }
}

export function creativeSectionTitle(
  section: CreativeFieldSection | CreativeFieldSectionId,
  locale: Locale = "he"
): string {
  const resolved =
    typeof section === "string"
      ? CREATIVE_FIELD_SECTIONS.find((candidate) => candidate.id === section)
      : section;
  if (!resolved) return String(section);
  return locale === "en" ? (resolved.titleEn ?? SECTION_TITLE_EN[resolved.id]) : resolved.titleHe;
}

export function creativeFieldLabel(key: keyof CreativeOptions, locale: Locale = "he"): string {
  return locale === "en" ? (FIELD_LABEL_EN[key] ?? String(key)) : (LABEL_BY_KEY[key] ?? String(key));
}

export function normalizeCreativeOptionValue(key: keyof CreativeOptions, value: string): string {
  const field = CREATIVE_FIELD_DEFS.find((candidate) => candidate.key === key);
  const option = field?.options?.find(
    (candidate) =>
      candidate.value === value ||
      candidate.code === value ||
      candidate.labelHe === value ||
      candidate.labelEn?.toLowerCase() === value.toLowerCase()
  );
  return option?.value ?? value;
}

export function creativeOptionLabel(
  key: keyof CreativeOptions,
  value: string,
  locale: Locale = "he"
): string {
  const normalized = normalizeCreativeOptionValue(key, value);
  const field = CREATIVE_FIELD_DEFS.find((candidate) => candidate.key === key);
  const option = field?.options?.find((candidate) => candidate.value === normalized);
  if (!option) return value;
  return locale === "en" ? (option.labelEn ?? option.value) : option.labelHe;
}

/** Returns a shallow normalized copy suitable for older pipeline consumers. */
export function normalizeCreativeOptions(creative: CreativeOptions): CreativeOptions {
  const normalized = { ...creative };
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === "string") {
      (normalized as Record<string, unknown>)[key] = normalizeCreativeOptionValue(
        key as keyof CreativeOptions,
        value
      );
    }
  }
  return normalized;
}

export function getCreativeFieldSections(
  locale: Locale = "he"
): Array<
  CreativeFieldSection & {
    title: string;
    fields: Array<
      CreativeFieldDef & {
        label: string;
        options?: Array<NonNullable<CreativeFieldDef["options"]>[number] & { label: string }>;
      }
    >;
  }
> {
  return CREATIVE_FIELD_SECTIONS.map((section) => ({
    ...section,
    title: creativeSectionTitle(section, locale),
    fields: section.fields.map((field) => ({
      ...field,
      label: creativeFieldLabel(field.key, locale),
      options: field.options?.map((option) => ({
        ...option,
        label: locale === "en" ? (option.labelEn ?? option.value) : option.labelHe
      }))
    }))
  }));
}

/** Flatten selected creative options into prompt-friendly localized lines for agents and UI. */
export function formatCreativeConstraints(
  creative?: CreativeOptions | null,
  locale: Locale = "he"
): string[] {
  if (!creative) return [];
  const lines: string[] = [];
  for (const [key, value] of Object.entries(creative)) {
    if (value == null || value === "") continue;
    const creativeKey = key as keyof CreativeOptions;
    const normalizedValue = normalizeCreativeOptionValue(creativeKey, String(value));
    const displayValue = creativeOptionLabel(creativeKey, String(value), locale);
    const label = creativeFieldLabel(creativeKey, locale);
    if (key === "musicVolumePercent") {
      lines.push(`${label}: ${value}% ${locale === "he" ? "מתחת לקריינות" : "under narration"}`);
      continue;
    }
    if (key === "musicSync") {
      lines.push(`${label}: ${displayValue}`);
      continue;
    }
    if (key === "logoPlacement") {
      const map: Record<string, string> = {
        none: "ללא",
        always: "קבוע",
        end_only: "רק בסיום",
        open_and_end: "פתיח וסיום"
      };
      lines.push(`${label}: ${locale === "he" ? (map[normalizedValue] ?? displayValue) : displayValue}`);
      continue;
    }
    if (key === "voiceGender") {
      lines.push(`${label}: ${displayValue}`);
      continue;
    }
    if (key === "videoOrientation") {
      lines.push(
        `${label}: ${
          normalizedValue === "landscape"
            ? locale === "he"
              ? "לרוחב (16:9)"
              : "Landscape (16:9)"
            : locale === "he"
              ? "לאורך (9:16)"
              : "Portrait (9:16)"
        }`
      );
      continue;
    }
    if (
      key === "karaokeCaptions" ||
      key === "sideWatermark" ||
      key === "preferHeygenDub" ||
      key === "lowerThirds"
    ) {
      lines.push(
        `${label}: ${locale === "he" ? (normalizedValue === "on" ? "פעיל" : "כבוי") : normalizedValue === "on" ? "On" : "Off"}`
      );
      continue;
    }
    if (key === "filmTemplate") {
      const map: Record<string, string> = {
        corporate_product: "סרט מוצר B2B",
        social_explainer: "סרטון הסברה לרשתות — Hook → בעיה → הסבר חזותי → פתרון → CTA",
        public_service_explainer: "הסברה / שירות ציבורי — מצב → סיכון → כללים מעשיים → מסר מסכם",
        product_demo: "בעיה → הדגמת מוצר → יתרונות → פתרון → CTA",
        testimonial: "בעיה אישית → חוויה → שינוי → המלצה"
      };
      lines.push(`${label}: ${locale === "he" ? (map[normalizedValue] ?? displayValue) : displayValue}`);
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
        "אנימציה תלת־ממד משפחתית":
          "premium family-friendly stylized 3D animation, rounded expressive characters",
        "אנימציה דו־ממד": "clean 2D animation with readable shapes and controlled motion",
        "סרט קולנועי": "cinematic commercial, deliberate composition, shallow depth and motivated camera",
        דוקומנטרי: "natural documentary photography, observational camera and authentic moments",
        "UGC אותנטי": "authentic smartphone UGC, natural light and candid framing",
        "לייף סטייל": "aspirational lifestyle commercial with natural product use",
        "סרטון הסברה": "clear visual explainer with concrete demonstrations and instructional pacing",
        "הדגמת מוצר": "step-by-step product demonstration with close-up feature shots",
        קליימיישן: "handcrafted clay stop-motion look",
        "גזירי נייר": "layered paper-cut illustration and tactile shadows",
        איזומטרי: "clean isometric illustration and structured spatial composition",
        רטרו: "retro commercial design with period-appropriate texture and palette",
        סוריאליסטי: "surreal but coherent commercial imagery",
        "עריכת מגזין": "premium editorial composition, restrained motion and luxury typography",
        אנימה: "anime style, clean line art",
        "איור וקטורי": "flat vector illustration",
        "סטופ־מושן": "stop-motion clay/puppet look",
        "חדשות אולפן":
          "TV news studio desk and plain backdrop — no wall maps, globes, tickers, or graphics overlays",
        "סרט מוצר B2B":
          "corporate B2B product film — clean product hero shots, office/secure facility, professional VO pacing"
      };
      const hint = styleHints[normalizedValue];
      lines.push(hint ? `${label}: ${displayValue} (${hint})` : `${label}: ${displayValue}`);
      continue;
    }
    lines.push(`${label}: ${displayValue}`);
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

  const sex: "male" | "female" =
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
