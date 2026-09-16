import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext.js";
import { PricingCards } from "./PricingCards.js";
import { PublicChrome } from "./PublicChrome.js";

export function LandingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const arrow = i18n.dir() === "rtl" ? "←" : "→";

  return (
    <PublicChrome onNavigate={onNavigate}>
      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden />
              {t("landing.eyebrow")}
            </p>
            <h1>
              {t("landing.heroTitle")}
              <span> {t("landing.heroTitleAccent")}</span>
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
            <ul className="landing-assurances" aria-label={t("landing.benefitsLabel")}>
              <li>
                <span aria-hidden>✓</span> {t("landing.guided")}
              </li>
              <li>
                <span aria-hidden>✓</span> {t("landing.productAndCharacters")}
              </li>
              <li>
                <span aria-hidden>✓</span> {t("landing.brandingAndCaptions")}
              </li>
            </ul>
          </div>

          <div className="product-showcase" aria-label={t("landing.previewLabel")}>
            <div className="showcase-glow" />
            <div className="showcase-window">
              <div className="showcase-topbar">
                <span className="showcase-brand">
                  <i>P2</i> {t("landing.showcase.newProductVideo")}
                </span>
                <span className="showcase-status">{t("landing.showcase.creating")}</span>
              </div>
              <div className="showcase-body">
                <div className="showcase-sidebar">
                  <span className="showcase-nav-active">{t("landing.showcase.overview")}</span>
                  <span>{t("landing.showcase.script")}</span>
                  <span>{t("landing.showcase.visual")}</span>
                  <span>{t("landing.showcase.render")}</span>
                </div>
                <div className="showcase-content">
                  <div className="showcase-video">
                    <div className="showcase-video-art">
                      <span className="video-orbit orbit-one" />
                      <span className="video-orbit orbit-two" />
                      <strong>
                        {t("landing.showcase.yourIdea")}
                        <br />
                        {t("landing.showcase.yourVideo")}
                      </strong>
                      <span className="video-play" aria-hidden>
                        ▶
                      </span>
                    </div>
                    <div className="showcase-progress">
                      <span />
                    </div>
                  </div>
                  <div className="showcase-steps">
                    {[t("landing.showcase.brief"), t("landing.showcase.script"), t("landing.showcase.voice"), t("landing.showcase.visual")].map(
                      (step) => (
                        <span key={step}>
                          <i>✓</i>
                          {step}
                        </span>
                      )
                    )}
                    <span className="is-current">
                      <i>5</i>
                      {t("landing.showcase.render")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="showcase-float-card float-cost">
              <span>{t("landing.showcase.costEstimate")}</span>
              <strong>{t("landing.showcase.transparent")}</strong>
            </div>
            <div className="showcase-float-card float-ready">
              <span className="ready-icon" aria-hidden>
                ✓
              </span>
              <span>
                <strong>{t("landing.showcase.ready")}</strong>
                <small>{t("landing.showcase.watchAndDownload")}</small>
              </span>
            </div>
          </div>
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
            <li>
              <span>04</span>
              <div>
                <h3>{t("landing.process.receiveTitle")}</h3>
                <p>{t("landing.process.receiveBody")}</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="landing-value-grid" aria-label={t("landing.capabilitiesLabel")}>
          <article>
            <span className="feature-icon" aria-hidden>
              ✦
            </span>
            <div>
              <h2>{t("landing.features.oneFlowTitle")}</h2>
              <p>{t("landing.features.oneFlowBody")}</p>
            </div>
          </article>
          <article>
            <span className="feature-icon" aria-hidden>
              ◫
            </span>
            <div>
              <h2>{t("landing.features.assetsTitle")}</h2>
              <p>{t("landing.features.assetsBody")}</p>
            </div>
          </article>
          <article>
            <span className="feature-icon" aria-hidden>
              ◎
            </span>
            <div>
              <h2>{t("landing.features.controlTitle")}</h2>
              <p>{t("landing.features.controlBody")}</p>
            </div>
          </article>
          <article>
            <span className="feature-icon" aria-hidden>
              ▣
            </span>
            <div>
              <h2>{t("landing.features.creditsTitle")}</h2>
              <p>{t("landing.features.creditsBody")}</p>
            </div>
          </article>
        </section>

        <section className="landing-pricing" id="pricing">
          <div className="section-heading">
            <p className="eyebrow">{t("landing.plans.eyebrow")}</p>
            <h2>{t("landing.plans.title")}</h2>
            <p className="section-lead">{t("landing.plans.lead")}</p>
          </div>
          <PricingCards mode="teaser" onSelect={() => onNavigate("/pricing")} />
        </section>

        <section className="landing-close">
          <h2>{t("landing.close.title")}</h2>
          <p>{t("landing.close.body")}</p>
          <div className="landing-hero-actions">
            <button type="button" className="primary landing-cta" onClick={login}>
              {t("landing.firstVideo")}
              <span aria-hidden>{arrow}</span>
            </button>
            <p className="muted landing-auth-hint">{t("landing.firstVideoHint")}</p>
            <button type="button" className="button-secondary" onClick={() => onNavigate("/pricing")}>
              {t("landing.close.pricing")}
            </button>
          </div>
        </section>
      </main>
    </PublicChrome>
  );
}
