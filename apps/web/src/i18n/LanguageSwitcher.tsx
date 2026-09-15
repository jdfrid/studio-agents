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
        className={locale === "en" ? "is-active" : ""}
        aria-pressed={locale === "en"}
        aria-label={t("common.english")}
        onClick={() => void select("en")}
      >
        {compact ? "EN" : t("common.english")}
      </button>
      <button
        type="button"
        className={locale === "he" ? "is-active" : ""}
        aria-pressed={locale === "he"}
        aria-label={t("common.hebrew")}
        onClick={() => void select("he")}
      >
        {compact ? "HE" : t("common.hebrew")}
      </button>
    </div>
  );
}
