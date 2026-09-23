import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext.js";
import { PricingCards } from "./PricingCards.js";
import { PublicChrome } from "./PublicChrome.js";
import { CampaignPreview } from "./brand/CampaignPreview.js";
import { BRAND_POSTERS } from "./brand/posters.js";

export function LandingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const arrow = i18n.dir() === "rtl" ? "←" : "→";

  return (
    <PublicChrome onNavigate={onNavigate}>
      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="eyebrow">{t("common.brandTagline")}</p>
            <h1>
              {t("landing.heroTitle")}
              <br />
              <em>{t("landing.heroTitleAccent")}</em>
            </h1>
            <p className="landing-tagline">{t("landing.tagline")}</p>
            <div className="landing-hero-actions">
              <button type="button" className="primary landing-cta" onClick={login}>
                {t("landing.firstVideo")}
                <span aria-hidden>{arrow}</span>
              </button>
              <a className="button-link" href="#how-it-works">
                {t("landing.discover")}
              </a>
            </div>
            <p className="muted landing-auth-hint">{t("landing.firstVideoHint")}</p>
          </div>

          <div className="hero-art" aria-label={t("landing.previewLabel")}>
            <CampaignPreview kind="coffee" caption={t("landing.posters.coffeeLine")} />
            <div className="hero-float">
              <strong>✓ {t("landing.showcase.ready")}</strong>
              <span>{t("landing.showcase.watchAndDownload")}</span>
            </div>
          </div>
        </section>

        <div className="logos-line" aria-hidden>
          <span>Instagram Reels</span>
          <span>TikTok</span>
          <span>YouTube Shorts</span>
          <span>{t("landing.platforms.web")}</span>
        </div>

        <section className="landing-process" id="how-it-works">
          <div className="section-heading">
            <p className="eyebrow">{t("landing.process.eyebrow")}</p>
            <h2>{t("landing.process.title")}</h2>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>{t("landing.process.defineTitle")}</h3>
                <p>{t("landing.process.defineBody")}</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>{t("landing.process.assetsTitle")}</h3>
                <p>{t("landing.process.assetsBody")}</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>{t("landing.process.approveTitle")}</h3>
                <p>{t("landing.process.approveBody")}</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="poster-grid" aria-label={t("landing.posters.label")}>
          {BRAND_POSTERS.map((poster) => (
            <figure key={poster.id}>
              <CampaignPreview kind={poster.id} caption={t(`landing.posters.${poster.labelKey}Line`)} />
              <figcaption>{t(`landing.posters.${poster.labelKey}`)}</figcaption>
            </figure>
          ))}
        </section>

        <section className="landing-audience" aria-label={t("landing.audience.label")}>
          <div className="section-heading">
            <p className="eyebrow">{t("landing.audience.eyebrow")}</p>
            <h2>{t("landing.audience.title")}</h2>
          </div>
          <div className="landing-audience-grid">
            <article>
              <h3>{t("landing.audience.localTitle")}</h3>
              <p>{t("landing.audience.localBody")}</p>
            </article>
            <article>
              <h3>{t("landing.audience.marketerTitle")}</h3>
              <p>{t("landing.audience.marketerBody")}</p>
            </article>
            <article>
              <h3>{t("landing.audience.phoneTitle")}</h3>
              <p>{t("landing.audience.phoneBody")}</p>
            </article>
          </div>
        </section>

        <section className="landing-pricing" id="pricing">
          <div className="section-heading">
            <p className="eyebrow">{t("landing.plans.eyebrow")}</p>
            <h2>{t("landing.plans.title")}</h2>
            <p className="section-lead">{t("landing.plans.lead")}</p>
          </div>
          <PricingCards mode="teaser" onSelect={() => onNavigate("/pricing")} />
        </section>

        <section className="brand-banner">
          <h2>{t("landing.close.title")}</h2>
          <button type="button" className="primary lime" onClick={login}>
            {t("landing.firstVideo")}
            <span aria-hidden>{arrow}</span>
          </button>
        </section>
      </main>
    </PublicChrome>
  );
}
