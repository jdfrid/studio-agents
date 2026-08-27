import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources.js";
import { createVideoResources } from "./createVideoResources.js";
import { runResources } from "./runResources.js";

export const UI_LOCALE_STORAGE_KEY = "prompt2spot:ui-locale";
export type UiLocale = "he" | "en";

function isUiLocale(value: string | null): value is UiLocale {
  return value === "he" || value === "en";
}

function storedLocale(): UiLocale {
  try {
    const value = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY);
    return isUiLocale(value) ? value : "he";
  } catch {
    return "he";
  }
}

export function localeFor(language = i18n.resolvedLanguage): UiLocale {
  return language?.startsWith("en") ? "en" : "he";
}

function syncDocument(locale: UiLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
}

void i18n.use(initReactI18next).init({
  resources: {
    he: {
      translation: resources.he.translation,
      createVideo: createVideoResources.he,
      run: runResources.he
    },
    en: {
      translation: resources.en.translation,
      createVideo: createVideoResources.en,
      run: runResources.en
    }
  },
  lng: storedLocale(),
  fallbackLng: "he",
  supportedLngs: ["he", "en"],
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false
});

syncDocument(localeFor());

i18n.on("languageChanged", (language) => {
  const locale = localeFor(language);
  syncDocument(locale);
  try {
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
});

export { i18n };
export default i18n;
