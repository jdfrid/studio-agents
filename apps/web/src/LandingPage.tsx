import { useAuth } from "./AuthContext.js";

export function LandingPage() {
  const { login } = useAuth();
  return (
    <div className="landing">
      <section className="landing-hero">
        <h1>Prompt2Spot</h1>
        <p className="landing-tagline">הפוך רעיון לסרטון קצר — בלחיצה אחת</p>
        <p className="muted">תאר את הסרטון שאתה רוצה, והמערכת תבנה אותו שלב אחר שלב — תסריט, קול, ויזואל ורינדור.</p>
        <button type="button" className="primary landing-cta" onClick={login}>
          התחבר עם Google
        </button>
      </section>
      <section className="pricing-cards">
        <article className="price-card">
          <h3>סרטון בודד</h3>
          <p className="price">₪30</p>
          <p className="muted">קרדיט אחד · סרטון אחד</p>
        </article>
        <article className="price-card featured">
          <h3>מנוי חודשי</h3>
          <p className="price">₪600</p>
          <p className="muted">30 סרטונים · ~₪20 לסרטון</p>
        </article>
      </section>
    </div>
  );
}
