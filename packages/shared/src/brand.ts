/** Product identity. Domain and display name stay LTR in every locale. */
export const PRODUCT_NAME = "Reelmino";
export const PRODUCT_DOMAIN = "reelmino.com";
export const PRODUCT_URL = "https://reelmino.com";
export const PRODUCT_EMAIL = "contact@reelmino.com";
export const LEGACY_PRODUCT_NAME = "Prompt2Spot";
export const LEGACY_PRODUCT_DOMAIN = "prompt2spot.com";
export const LEGACY_PRODUCT_URL = "https://prompt2spot.com";

export const BRAND_TAGLINE_HE = "הסיפור שלכם. עכשיו בווידאו.";
export const BRAND_TAGLINE_EN = "Your story. Now in motion.";
export const PRODUCT_DESCRIPTION_HE = "סטודיו AI לסרטונים של העסק שלכם";
export const PRODUCT_DESCRIPTION_EN = "An AI video studio for your business";

/** Split "שם עברי (English Name)" so the end card does not reverse mixed bidi. */
export function splitBrandDisplayLines(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const split = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const hebrew = split?.[1]?.trim() ?? "";
  const latin = split?.[2]?.trim() ?? "";
  if (hebrew && latin && /[\u0590-\u05FF]/.test(hebrew) && /[A-Za-z]/.test(latin)) {
    return [hebrew, latin];
  }
  return [trimmed];
}

export function displayWebsiteHost(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Short spoken CTA — never read a raw URL or a mixed English parenthetical. */
export function brandEndSpokenLine(
  branding: { businessName?: string | null; slogan?: string | null; websiteUrl?: string | null } | null | undefined,
  language?: string | null
): string | undefined {
  if (!branding) return undefined;
  const hebrewName = splitBrandDisplayLines(branding.businessName ?? "")[0] ?? "";
  const slogan = branding.slogan?.trim() ?? "";
  const hasSite = Boolean(displayWebsiteHost(branding.websiteUrl ?? ""));
  const lang = (language ?? "he").toLowerCase();
  const isHe = lang.startsWith("he") || lang.startsWith("iw") || lang.includes("עבר");
  const parts: string[] = [];
  if (hebrewName) parts.push(hebrewName);
  else if (slogan) parts.push(slogan);
  if (hasSite) parts.push(isHe ? "בקרו באתר" : "Visit our website");
  return parts.length ? parts.join(". ") : undefined;
}
