import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext.js";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.js";

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  return (
    <div className="landing">
      <header className="landing-header">
        <a className="brand-lockup" href="/" aria-label={t("landing.homeLabel")}>
          <span className="brand-mark" aria-hidden>
            P2
          </span>
          <span className="brand-copy">
            <strong className="brand">Prompt2Spot</strong>
            <small>{t("common.brandTagline")}</small>
          </span>
        </a>
        <nav className="landing-nav" aria-label={t("landing.siteNav")}>
          <a href="#how-it-works">{t("landing.howItWorks")}</a>
          <a href="#pricing">{t("landing.pricing")}</a>
        </nav>
        <LanguageSwitcher compact />
        <button type="button" className="button-secondary landing-login" onClick={login}>
          {t("landing.login")}
        </button>
      </header>

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
            <p className="landing-tagline">
              {t("landing.tagline")}
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="primary landing-cta" onClick={login}>
                {t("landing.firstVideo")}
                <span aria-hidden>{i18n.dir() === "rtl" ? "←" : "→"}</span>
              </button>
              <a className="button-link" href="#how-it-works">
                {t("landing.discover")}
              </a>
            </div>
            <ul className="landing-assurances" aria-label={t("landing.benefitsLabel")}>
              <li><span aria-hidden>✓</span> {t("landing.guided")}</li>
              <li><span aria-hidden>✓</span> {t("landing.productAndCharacters")}</li>
              <li><span aria-hidden>✓</span> {t("landing.brandingAndCaptions")}</li>
            </ul>
          </div>

          <div className="product-showcase" aria-label={t("landing.previewLabel")}>
            <div className="showcase-glow" />
            <div className="showcase-window">
              <div className="showcase-topbar">
                <span className="showcase-brand"><i>P2</i> {t("landing.showcase.newProductVideo")}</span>
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
                      <strong>{t("landing.showcase.yourIdea")}<br />{t("landing.showcase.yourVideo")}</strong>
                      <span className="video-play" aria-hidden>▶</span>
                    </div>
                    <div className="showcase-progress"><span /></div>
                  </div>
                  <div className="showcase-steps">
                    {[t("landing.showcase.brief"), t("landing.showcase.script"), t("landing.showcase.voice"), t("landing.showcase.visual")].map((step) => (
                      <span key={step}><i>✓</i>{step}</span>
                    ))}
                    <span className="is-current"><i>5</i>{t("landing.showcase.render")}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="showcase-float-card float-cost">
              <span>{t("landing.showcase.costEstimate")}</span>
              <strong>{t("landing.showcase.transparent")}</strong>
            </div>
            <div className="showcase-float-card float-ready">
              <span className="ready-icon" aria-hidden>✓</span>
              <span><strong>{t("landing.showcase.ready")}</strong><small>{t("landing.showcase.watchAndDownload")}</small></span>
            </div>
          </div>
        </section>

        <section className="landing-value-grid" aria-label={t("landing.capabilitiesLabel")}>
          <article>
            <span className="feature-icon" aria-hidden>✦</span>
            <div><h2>{t("landing.features.oneFlowTitle")}</h2><p>{t("landing.features.oneFlowBody")}</p></div>
          </article>
          <article>
            <span className="feature-icon" aria-hidden>◫</span>
            <div><h2>{t("landing.features.assetsTitle")}</h2><p>{t("landing.features.assetsBody")}</p></div>
          </article>
          <article>
            <span className="feature-icon" aria-hidden>◎</span>
            <div><h2>{t("landing.features.controlTitle")}</h2><p>{t("landing.features.controlBody")}</p></div>
          </article>
        </section>

        <section className="landing-process" id="how-it-works">
          <div className="section-heading">
            <p className="eyebrow">{t("landing.process.eyebrow")}</p>
            <h2>{t("landing.process.title")}</h2>
          </div>
          <ol>
            <li><span>01</span><div><h3>{t("landing.process.defineTitle")}</h3><p>{t("landing.process.defineBody")}</p></div></li>
            <li><span>02</span><div><h3>{t("landing.process.assetsTitle")}</h3><p>{t("landing.process.assetsBody")}</p></div></li>
            <li><span>03</span><div><h3>{t("landing.process.approveTitle")}</h3><p>{t("landing.process.approveBody")}</p></div></li>
            <li><span>04</span><div><h3>{t("landing.process.receiveTitle")}</h3><p>{t("landing.process.receiveBody")}</p></div></li>
          </ol>
        </section>

        <section className="landing-pricing" id="pricing">
          <div className="section-heading">
            <p className="eyebrow">{t("landing.plans.eyebrow")}</p>
            <h2>{t("landing.plans.title")}</h2>
          </div>
          <div className="pricing-cards">
            <article className="price-card">
              <span className="price-kicker">{t("landing.plans.try")}</span>
              <h3>{t("landing.plans.single")}</h3>
              <p className="price"><strong>₪30</strong><small>{t("landing.plans.perVideo")}</small></p>
              <ul>
                <li>{t("landing.plans.oneCredit")}</li>
                <li>{t("landing.plans.fullAccess")}</li>
                <li>{t("landing.plans.noCommitment")}</li>
              </ul>
              <button type="button" onClick={login}>{t("landing.plans.startNow")}</button>
            </article>
            <article className="price-card featured">
              <span className="popular-badge">{t("landing.plans.popular")}</span>
              <span className="price-kicker">{t("landing.plans.regular")}</span>
              <h3>{t("landing.plans.monthly")}</h3>
              <p className="price"><strong>₪600</strong><small>{t("landing.plans.perMonth")}</small></p>
              <ul>
                <li>{t("landing.plans.videosPerMonth")}</li>
                <li>{t("landing.plans.approxPerVideo")}</li>
                <li>{t("landing.plans.teams")}</li>
              </ul>
              <button type="button" className="primary" onClick={login}>{t("landing.plans.startCreating")}</button>
            </article>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden>P2</span>
          <strong>Prompt2Spot</strong>
        </div>
        <p>{t("landing.footer")}</p>
      </footer>
    </div>
  );
}
