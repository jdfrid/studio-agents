import { useTranslation } from "react-i18next";
import { localeFor, type UiLocale } from "./index.js";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage);

  async function select(next: UiLocale) {
    if (next !== locale) await i18n.changeLanguage(next);
  }

  return (
    <div className={`language-switcher${compact ? " language-switcher-compact" : ""}`} aria-label={t("common.language")}>
      <button
        type="button"
        className={locale === "he" ? "is-active" : ""}
        aria-pressed={locale === "he"}
        onClick={() => void select("he")}
      >
        עברית
      </button>
      <button
        type="button"
        className={locale === "en" ? "is-active" : ""}
        aria-pressed={locale === "en"}
        onClick={() => void select("en")}
      >
        English
      </button>
    </div>
  );
}
