import { localeFor, type UiLocale } from "./index.js";

const intlLocales: Record<UiLocale, string> = {
  he: "he-IL",
  en: "en-US"
};

export function intlLocale(locale: UiLocale = localeFor()): string {
  return intlLocales[locale];
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocales[localeFor()], options).format(value);
}

export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocales[localeFor()], options).format(new Date(value));
}

export function formatDateTime(value: Date | string | number): string {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatCurrency(
  value: number,
  currency = "ILS",
  options?: Omit<Intl.NumberFormatOptions, "style" | "currency">
): string {
  return new Intl.NumberFormat(intlLocales[localeFor()], {
    ...options,
    style: "currency",
    currency
  }).format(value);
}
