/** Locales supported by shared UI/display helpers. */
export type Locale = "he" | "en";

export const DEFAULT_LOCALE: Locale = "he";

export function localizedText(locale: Locale, labels: { he: string; en: string }): string {
  return locale === "en" ? labels.en : labels.he;
}
