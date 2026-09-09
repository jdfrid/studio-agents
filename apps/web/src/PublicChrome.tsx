import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext.js";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.js";

export function PublicChrome({
  children,
  onNavigate
}: {
  children: ReactNode;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const { t: st } = useTranslation("site");
  const { user, login } = useAuth();

  return (
    <div className="landing site-shell">
      <header className="landing-header">
        <button type="button" className="brand-lockup" onClick={() => onNavigate("/")} aria-label={t("landing.homeLabel")}>
          <span className="brand-mark" aria-hidden>
            P2
          </span>
          <span className="brand-copy">
            <strong className="brand">Prompt2Spot</strong>
            <small>{t("common.brandTagline")}</small>
          </span>
        </button>
        <nav className="landing-nav" aria-label={t("landing.siteNav")}>
          <button type="button" className="nav-text" onClick={() => onNavigate("/about")}>
            {st("nav.about")}
          </button>
          <button type="button" className="nav-text" onClick={() => onNavigate("/pricing")}>
            {t("landing.pricing")}
          </button>
          <button type="button" className="nav-text" onClick={() => onNavigate("/contact")}>
            {st("nav.contact")}
          </button>
        </nav>
        <LanguageSwitcher compact />
        {user ? (
          <button type="button" className="button-secondary landing-login" onClick={() => onNavigate("/")}>
            {st("nav.studio")}
          </button>
        ) : (
          <button type="button" className="button-secondary landing-login" onClick={login}>
            {t("landing.login")}
          </button>
        )}
      </header>
      {children}
      <footer className="landing-footer">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden>
            P2
          </span>
          <strong>Prompt2Spot</strong>
        </div>
        <nav className="footer-links" aria-label={st("footer.legalNav")}>
          <button type="button" className="nav-text" onClick={() => onNavigate("/about")}>
            {st("nav.about")}
          </button>
          <button type="button" className="nav-text" onClick={() => onNavigate("/contact")}>
            {st("nav.contact")}
          </button>
          <button type="button" className="nav-text" onClick={() => onNavigate("/terms")}>
            {st("nav.terms")}
          </button>
          <button type="button" className="nav-text" onClick={() => onNavigate("/legal")}>
            {st("nav.commercial")}
          </button>
          <button type="button" className="nav-text" onClick={() => onNavigate("/privacy")}>
            {st("nav.privacy")}
          </button>
        </nav>
        <p>{t("landing.footer")}</p>
      </footer>
    </div>
  );
}
