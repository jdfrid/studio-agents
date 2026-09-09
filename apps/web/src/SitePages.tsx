import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
import { PublicChrome } from "./PublicChrome.js";

export function AboutPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useTranslation("site");
  return (
    <PublicChrome onNavigate={onNavigate}>
      <main className="site-page">
        <p className="eyebrow">{t("about.eyebrow")}</p>
        <h1>{t("about.title")}</h1>
        <p className="site-lead">{t("about.lead")}</p>
        <section className="site-prose">
          <h2>{t("about.whatTitle")}</h2>
          <p>{t("about.whatBody")}</p>
          <h2>{t("about.whoTitle")}</h2>
          <p>{t("about.whoBody")}</p>
          <h2>{t("about.howTitle")}</h2>
          <p>{t("about.howBody")}</p>
        </section>
      </main>
    </PublicChrome>
  );
}

export function ContactPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t, i18n } = useTranslation("site");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    try {
      await apiPost("/contact", {
        name,
        email,
        subject,
        message,
        locale: i18n.language?.startsWith("he") ? "he" : "en",
        companyWebsite: honeypot
      });
      setStatus("ok");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError((err as Error).message || t("contact.error"));
    }
  }

  return (
    <PublicChrome onNavigate={onNavigate}>
      <main className="site-page">
        <p className="eyebrow">{t("contact.eyebrow")}</p>
        <h1>{t("contact.title")}</h1>
        <p className="site-lead">{t("contact.lead")}</p>
        {status === "ok" ? (
          <p className="site-success">{t("contact.thanks")}</p>
        ) : (
          <form className="contact-form" onSubmit={(e) => void onSubmit(e)}>
            <label>
              {t("contact.name")}
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
            </label>
            <label>
              {t("contact.email")}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              {t("contact.subject")}
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={160} />
            </label>
            <label>
              {t("contact.message")}
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} rows={6} />
            </label>
            <label className="contact-honeypot" aria-hidden>
              Company website
              <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </label>
            {error ? <p className="error-inline">{error}</p> : null}
            <button type="submit" className="primary" disabled={status === "sending"}>
              {status === "sending" ? t("contact.sending") : t("contact.send")}
            </button>
          </form>
        )}
      </main>
    </PublicChrome>
  );
}

export function LegalPage({
  kind,
  onNavigate
}: {
  kind: "terms" | "privacy" | "commercial";
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation("site");
  const sections = t(`legal.${kind}.sections`, { returnObjects: true }) as { title: string; body: string }[];
  return (
    <PublicChrome onNavigate={onNavigate}>
      <main className="site-page">
        <p className="eyebrow">{t(`legal.${kind}.eyebrow`)}</p>
        <h1>{t(`legal.${kind}.title`)}</h1>
        <p className="site-lead">{t(`legal.${kind}.updated`)}</p>
        <article className="site-prose">
          {Array.isArray(sections)
            ? sections.map((section) => (
                <section key={section.title}>
                  <h2>{section.title}</h2>
                  <p>{section.body}</p>
                </section>
              ))
            : null}
        </article>
      </main>
    </PublicChrome>
  );
}

export function PricingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  const { t: st } = useTranslation("site");
  const { login, user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState("");
  const billingReady = user?.billingConfigured ?? false;

  async function buy(plan: "payg" | "subscription") {
    if (!user) {
      login();
      return;
    }
    setBusy(plan);
    setPurchaseError("");
    try {
      const { checkoutUrl } = await apiPost<{ checkoutUrl: string }>("/billing/checkout", { plan });
      window.location.href = checkoutUrl;
    } catch (err) {
      setPurchaseError((err as Error).message || t("dashboard.purchaseError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <PublicChrome onNavigate={onNavigate}>
      <main className="site-page">
        <p className="eyebrow">{t("landing.plans.eyebrow")}</p>
        <h1>{t("landing.plans.title")}</h1>
        <p className="site-lead">{st("pricing.checkoutLead")}</p>
        <div className="pricing-cards site-pricing-cards">
          <article className="price-card">
            <span className="price-kicker">{t("landing.plans.try")}</span>
            <h3>{t("landing.plans.single")}</h3>
            <p className="price">
              <strong>₪30</strong>
              <small>{t("landing.plans.perVideo")}</small>
            </p>
            <ul>
              <li>{t("landing.plans.oneCredit")}</li>
              <li>{t("landing.plans.fullAccess")}</li>
              <li>{t("landing.plans.noCommitment")}</li>
            </ul>
            <button
              type="button"
              disabled={Boolean(user) && (busy !== null || !billingReady)}
              onClick={() => void buy("payg")}
            >
              {busy === "payg" ? t("dashboard.openingPayment") : t("landing.plans.startNow")}
            </button>
          </article>
          <article className="price-card featured">
            <span className="popular-badge">{t("landing.plans.popular")}</span>
            <span className="price-kicker">{t("landing.plans.regular")}</span>
            <h3>{t("landing.plans.monthly")}</h3>
            <p className="price">
              <strong>₪600</strong>
              <small>{t("landing.plans.perMonth")}</small>
            </p>
            <ul>
              <li>{t("landing.plans.videosPerMonth")}</li>
              <li>{t("landing.plans.approxPerVideo")}</li>
              <li>{t("landing.plans.teams")}</li>
            </ul>
            <button
              type="button"
              className="primary"
              disabled={Boolean(user) && (busy !== null || !billingReady)}
              onClick={() => void buy("subscription")}
            >
              {busy === "subscription" ? t("dashboard.openingPayment") : t("landing.plans.startCreating")}
            </button>
          </article>
        </div>
        {user && !billingReady ? <p className="muted billing-note">{t("dashboard.billingUnavailable")}</p> : null}
        {purchaseError ? <p className="error-inline">{purchaseError}</p> : null}
        <div className="site-cta-row">
          <button type="button" className="button-secondary" onClick={() => onNavigate("/contact")}>
            {st("pricing.contactCta")}
          </button>
        </div>
      </main>
    </PublicChrome>
  );
}
