import { z } from "zod";
import { CreativeOptionsSchema, type CreativeOptions } from "../creativeOptions.js";
import { VOICE_CHARACTER_PRESETS } from "../voiceCatalog.js";
import type { BriefInput } from "./brief.js";

export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const VariationModeSchema = z.enum(["lock", "vary"]);
export type VariationMode = z.infer<typeof VariationModeSchema>;

export const BrandVariationPolicySchema = z
  .object({
    music: VariationModeSchema.default("vary"),
    voice: VariationModeSchema.default("vary"),
    visual: VariationModeSchema.default("vary")
  })
  .strict();
export type BrandVariationPolicy = z.infer<typeof BrandVariationPolicySchema>;

const LineListSchema = z.array(z.string().trim().min(1).max(200)).max(8).default([]);

export const BrandTemplateWriteSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    businessName: z.string().trim().max(120).optional().nullable(),
    slogan: z.string().trim().max(200).optional().nullable(),
    websiteUrl: z.string().trim().max(300).optional().nullable(),
    primaryColor: HexColorSchema.optional().nullable(),
    secondaryColor: HexColorSchema.optional().nullable(),
    messages: LineListSchema,
    mustSay: LineListSchema,
    mustAvoid: LineListSchema,
    filmTemplate: z.string().trim().max(80).optional().nullable(),
    durationSeconds: z.number().int().min(5).max(180).optional().nullable(),
    platform: z.string().trim().max(40).optional().nullable(),
    variationPolicy: BrandVariationPolicySchema.optional(),
    defaultCreative: CreativeOptionsSchema.optional(),
    /** New logo as a data URL; omitted keeps the stored logo. */
    logoDataUrl: z.string().max(8_000_000).optional().nullable(),
    logoName: z.string().trim().max(120).optional().nullable(),
    logoMimeType: z.string().trim().max(80).optional().nullable(),
    clearLogo: z.boolean().optional()
  })
  .strict();
export type BrandTemplateWrite = z.infer<typeof BrandTemplateWriteSchema>;

export const BrandTemplateViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  businessName: z.string().nullable().optional(),
  slogan: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  secondaryColor: z.string().nullable().optional(),
  messages: z.array(z.string()),
  mustSay: z.array(z.string()),
  mustAvoid: z.array(z.string()),
  filmTemplate: z.string().nullable().optional(),
  durationSeconds: z.number().int().nullable().optional(),
  platform: z.string().nullable().optional(),
  variationPolicy: BrandVariationPolicySchema,
  defaultCreative: CreativeOptionsSchema.optional(),
  logoGcsPath: z.string().nullable().optional(),
  logoName: z.string().nullable().optional(),
  logoMimeType: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type BrandTemplateView = z.infer<typeof BrandTemplateViewSchema>;

export type BrandTemplateStarter = {
  id: string;
  nameHe: string;
  nameEn: string;
  helpHe: string;
  helpEn: string;
  draft: Omit<BrandTemplateWrite, "name"> & { nameHe: string; nameEn: string };
};

export const BRAND_TEMPLATE_STARTERS: BrandTemplateStarter[] = [
  {
    id: "daily_deals",
    nameHe: "חנות דילים יומית",
    nameEn: "Daily deals shop",
    helpHe: "מוצר אחר כל סרטון, מותג ואתר קבועים — מתאים לחנות כמו DealsLuxy.",
    helpEn: "A different product each video, with a fixed brand and website — for shops like DealsLuxy.",
    draft: {
      nameHe: "חנות דילים",
      nameEn: "Deals shop",
      filmTemplate: "product_demo",
      durationSeconds: 30,
      platform: "instagram_reels",
      primaryColor: "#C9A227",
      secondaryColor: "#0D1117",
      messages: [
        "Limited-time deal — shop while it lasts.",
        "Premium picks, honest prices.",
        "Free shipping on qualifying orders."
      ],
      mustSay: ["Always mention the shop website.", "End with a clear buy / visit-site call to action."],
      mustAvoid: ["Do not invent a price the user did not provide.", "Do not name competing shops."],
      variationPolicy: { music: "vary", voice: "vary", visual: "vary" }
    }
  },
  {
    id: "local_business",
    nameHe: "עסק מקומי",
    nameEn: "Local business",
    helpHe: "מסר קבוע על המקום והשירות, עם מבצע או מוצר שמתחלף.",
    helpEn: "A fixed local-business promise, with a rotating offer or product.",
    draft: {
      nameHe: "עסק מקומי",
      nameEn: "Local business",
      filmTemplate: "social_explainer",
      durationSeconds: 30,
      platform: "instagram_reels",
      primaryColor: "#3B6EF0",
      secondaryColor: "#10141D",
      messages: ["Serving the neighborhood.", "Come in or book online today."],
      mustSay: ["Mention the business name and website or location."],
      mustAvoid: ["Do not invent opening hours or addresses."],
      variationPolicy: { music: "vary", voice: "vary", visual: "vary" }
    }
  },
  {
    id: "service",
    nameHe: "שירות / מומחה",
    nameEn: "Service / expert",
    helpHe: "מותג אמין קבוע, וכל סרטון מסביר בעיה או שירות אחר.",
    helpEn: "A trusted brand frame, with each video covering a different problem or service.",
    draft: {
      nameHe: "שירות",
      nameEn: "Service",
      filmTemplate: "testimonial",
      durationSeconds: 45,
      platform: "instagram_reels",
      primaryColor: "#7AF0BF",
      secondaryColor: "#0F1218",
      messages: ["Clear advice. Real results.", "Book a consult from the website."],
      mustSay: ["Point viewers to the website for the next step."],
      mustAvoid: ["Do not promise medical, legal, or financial outcomes the user did not state."],
      variationPolicy: { music: "vary", voice: "lock", visual: "vary" }
    }
  }
];

const VARY_MUSIC = ["איטי", "בינוני", "מהיר"] as const;
const VARY_VISUAL = ["הדגמת מוצר", "לייף סטייל", "UGC אותנטי", "יוקרתי", "סרט קולנועי", "מודרני"] as const;
const VARY_VOICE = VOICE_CHARACTER_PRESETS.filter((preset) => preset.age === "adult").map((preset) => preset.id);

function pickOne<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

export function normalizeHexColor(value?: string | null): string | undefined {
  const hex = String(value ?? "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return undefined;
  return hex.toUpperCase();
}

/** FFmpeg lavfi color, e.g. 0x0D1117 */
export function hexToFfmpegColor(value?: string | null, fallback = "0x0d1117"): string {
  const hex = normalizeHexColor(value);
  return hex ? `0x${hex.slice(1)}` : fallback;
}

/** ASS BGR color with leading alpha, e.g. &H0027A2C9 for #C9A227 */
export function hexToAssColor(value?: string | null, fallback = "&H00FFFFFF"): string {
  const hex = normalizeHexColor(value);
  if (!hex) return fallback;
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`.toUpperCase();
}

export function hexLuminance(value?: string | null): number {
  const hex = normalizeHexColor(value);
  if (!hex) return 0;
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastTextHex(background?: string | null): string {
  return hexLuminance(background) > 0.55 ? "#111827" : "#F8FAFC";
}

export function applyBrandVariation(
  template: Pick<BrandTemplateView, "variationPolicy" | "defaultCreative" | "filmTemplate" | "primaryColor">,
  random: () => number = Math.random
): CreativeOptions {
  const locked = template.defaultCreative ?? {};
  const policy = template.variationPolicy;
  const next: CreativeOptions = { ...locked };
  if (template.filmTemplate) next.filmTemplate = template.filmTemplate as CreativeOptions["filmTemplate"];
  if (normalizeHexColor(template.primaryColor)) next.colorPalette = "צבעי מותג";

  if (policy.music === "lock") {
    if (locked.musicTempo) next.musicTempo = locked.musicTempo;
  } else {
    next.musicTempo = pickOne(VARY_MUSIC, random);
  }
  if (policy.voice === "lock") {
    if (locked.voiceCharacter) next.voiceCharacter = locked.voiceCharacter;
    if (locked.voiceGender) next.voiceGender = locked.voiceGender;
  } else {
    next.voiceCharacter = pickOne(VARY_VOICE, random);
  }
  if (policy.visual === "lock") {
    if (locked.designStyle) next.designStyle = locked.designStyle;
  } else {
    next.designStyle = pickOne(VARY_VISUAL, random);
  }
  return next;
}

function linesToBlock(title: string, lines: string[]): string | undefined {
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  if (!clean.length) return undefined;
  return `${title}:\n- ${clean.join("\n- ")}`;
}

/** Merge a saved brand template into a new run brief without replacing the product story. */
export function applyBrandTemplateToBrief(
  brief: BriefInput,
  template: BrandTemplateView,
  options?: { random?: () => number; applyVariation?: boolean }
): BriefInput {
  const branding = {
    ...(brief.branding ?? {}),
    businessName: brief.branding?.businessName?.trim() || template.businessName?.trim() || undefined,
    slogan: brief.branding?.slogan?.trim() || template.slogan?.trim() || undefined,
    websiteUrl: brief.branding?.websiteUrl?.trim() || template.websiteUrl?.trim() || undefined,
    primaryColor: brief.branding?.primaryColor || template.primaryColor || undefined,
    secondaryColor: brief.branding?.secondaryColor || template.secondaryColor || undefined
  };
  const hasBrand = Boolean(
    branding.businessName || branding.slogan || branding.websiteUrl || branding.primaryColor || template.logoGcsPath
  );
  const extraInstructions = [
    linesToBlock("Brand messages to weave in (do not replace the product script)", template.messages),
    linesToBlock("Must include", template.mustSay),
    linesToBlock("Must avoid", template.mustAvoid)
  ].filter(Boolean);
  const instructions = [brief.instructions?.trim(), ...extraInstructions].filter(Boolean).join("\n\n") || undefined;

  const attachments = [...(brief.attachments ?? [])];
  const hasLogo = attachments.some((item) => item.role === "logo");
  if (!hasLogo && template.logoGcsPath) {
    attachments.push({
      name: template.logoName || "brand-logo.png",
      mimeType: template.logoMimeType || "image/png",
      gcsPath: template.logoGcsPath,
      kind: "image",
      role: "logo"
    });
  }

  const durationSeconds = brief.durationSeconds || template.durationSeconds || 30;
  const varied =
    options?.applyVariation === false
      ? (template.defaultCreative ?? {})
      : applyBrandVariation(template, options?.random);
  const creative: CreativeOptions = {
    ...varied,
    ...(brief.creative ?? {})
  };
  if (!creative.filmTemplate && template.filmTemplate) {
    creative.filmTemplate = template.filmTemplate as CreativeOptions["filmTemplate"];
  }
  if (template.platform === "youtube" || template.platform === "website") {
    creative.videoOrientation = creative.videoOrientation ?? "landscape";
  } else if (template.platform) {
    creative.videoOrientation = creative.videoOrientation ?? "portrait";
  }

  return {
    ...brief,
    durationSeconds,
    brandTemplateId: template.id,
    ...(instructions ? { instructions } : {}),
    ...(hasBrand ? { branding } : {}),
    attachments,
    creative
  };
}
