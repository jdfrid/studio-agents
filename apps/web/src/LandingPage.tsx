import { useAuth } from "./AuthContext.js";

export function LandingPage() {
  const { login } = useAuth();
  return (
    <div className="landing">
      <header className="landing-header">
        <a className="brand-lockup" href="/" aria-label="Prompt2Spot — דף הבית">
          <span className="brand-mark" aria-hidden>
            P2
          </span>
          <span className="brand-copy">
            <strong className="brand">Prompt2Spot</strong>
            <small>AI video studio</small>
          </span>
        </a>
        <nav className="landing-nav" aria-label="ניווט באתר">
          <a href="#how-it-works">איך זה עובד</a>
          <a href="#pricing">מחירים</a>
        </nav>
        <button type="button" className="button-secondary landing-login" onClick={login}>
          כניסה
        </button>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden />
              סטודיו וידאו שלם, במקום אחד
            </p>
            <h1>
              מרעיון לסרטון עסקי
              <span> שמוכן לפרסום</span>
            </h1>
            <p className="landing-tagline">
              תארו את המטרה, העלו תמונות — ו־Prompt2Spot יוביל אתכם מתסריט וקול ועד ויזואל ורינדור.
              בלי ללמוד חמישה כלי AI.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="primary landing-cta" onClick={login}>
                צרו את הסרטון הראשון
                <span aria-hidden>←</span>
              </button>
              <a className="button-link" href="#how-it-works">
                גלו איך זה עובד
              </a>
            </div>
            <ul className="landing-assurances" aria-label="יתרונות">
              <li><span aria-hidden>✓</span> תהליך מודרך</li>
              <li><span aria-hidden>✓</span> תמונות מוצר ודמויות</li>
              <li><span aria-hidden>✓</span> מיתוג וכתוביות</li>
            </ul>
          </div>

          <div className="product-showcase" aria-label="תצוגה מקדימה של המערכת">
            <div className="showcase-glow" />
            <div className="showcase-window">
              <div className="showcase-topbar">
                <span className="showcase-brand"><i>P2</i> סרטון מוצר חדש</span>
                <span className="showcase-status">בתהליך יצירה</span>
              </div>
              <div className="showcase-body">
                <div className="showcase-sidebar">
                  <span className="showcase-nav-active">סקירה</span>
                  <span>תסריט</span>
                  <span>ויזואל</span>
                  <span>רינדור</span>
                </div>
                <div className="showcase-content">
                  <div className="showcase-video">
                    <div className="showcase-video-art">
                      <span className="video-orbit orbit-one" />
                      <span className="video-orbit orbit-two" />
                      <strong>הרעיון שלכם.<br />הסרטון שלכם.</strong>
                      <span className="video-play" aria-hidden>▶</span>
                    </div>
                    <div className="showcase-progress"><span /></div>
                  </div>
                  <div className="showcase-steps">
                    {["בריף", "תסריט", "קול", "ויזואל"].map((step) => (
                      <span key={step}><i>✓</i>{step}</span>
                    ))}
                    <span className="is-current"><i>5</i>רינדור</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="showcase-float-card float-cost">
              <span>הערכת עלות</span>
              <strong>שקופה מראש</strong>
            </div>
            <div className="showcase-float-card float-ready">
              <span className="ready-icon" aria-hidden>✓</span>
              <span><strong>הווידאו מוכן</strong><small>לצפייה והורדה</small></span>
            </div>
          </div>
        </section>

        <section className="landing-value-grid" aria-label="יכולות מרכזיות">
          <article>
            <span className="feature-icon" aria-hidden>✦</span>
            <div><h2>הכול בתהליך אחד</h2><p>בריף, תסריט, קול, תמונות, וידאו ואריזה סופית — בלי להעביר קבצים בין מערכות.</p></div>
          </article>
          <article>
            <span className="feature-icon" aria-hidden>◫</span>
            <div><h2>הנכסים שלכם במרכז</h2><p>העלו מוצר, דמות ולוגו כדי ליצור סרטון שמרגיש שייך לעסק שלכם.</p></div>
          </article>
          <article>
            <span className="feature-icon" aria-hidden>◎</span>
            <div><h2>שליטה כשצריך</h2><p>הפעילו אוטומטית או אשרו כל שלב. הוסיפו סנכרון שפתיים רק כשהרעיון דורש זאת.</p></div>
          </article>
        </section>

        <section className="landing-process" id="how-it-works">
          <div className="section-heading">
            <p className="eyebrow">פשוט להתחיל</p>
            <h2>מספרים לנו מה צריך. המערכת בונה את ההפקה.</h2>
          </div>
          <ol>
            <li><span>01</span><div><h3>מגדירים את הסרטון</h3><p>מטרה, קהל, מסר, משך וסגנון.</p></div></li>
            <li><span>02</span><div><h3>מוסיפים חומרי מותג</h3><p>תמונות מוצר, דמויות, קול ולוגו.</p></div></li>
            <li><span>03</span><div><h3>מאשרים או רצים אוטומטית</h3><p>אתם בוחרים כמה שליטה להשאיר בדרך.</p></div></li>
            <li><span>04</span><div><h3>מקבלים סרטון מוכן</h3><p>עם קול, כתוביות, מיתוג וקובץ סופי.</p></div></li>
          </ol>
        </section>

        <section className="landing-pricing" id="pricing">
          <div className="section-heading">
            <p className="eyebrow">מחיר פשוט וברור</p>
            <h2>מתחילים בסרטון אחד. גדלים כשמתאים.</h2>
          </div>
          <div className="pricing-cards">
            <article className="price-card">
              <span className="price-kicker">לנסות ולהתחיל</span>
              <h3>סרטון בודד</h3>
              <p className="price"><strong>₪30</strong><small>לסרטון</small></p>
              <ul>
                <li>קרדיט אחד לסרטון</li>
                <li>גישה לכל תהליך היצירה</li>
                <li>ללא התחייבות חודשית</li>
              </ul>
              <button type="button" onClick={login}>התחילו עכשיו</button>
            </article>
            <article className="price-card featured">
              <span className="popular-badge">הכי משתלם לעסקים</span>
              <span className="price-kicker">ליצירה קבועה</span>
              <h3>מנוי חודשי</h3>
              <p className="price"><strong>₪600</strong><small>לחודש</small></p>
              <ul>
                <li>30 סרטונים בחודש</li>
                <li>כ־₪20 לסרטון</li>
                <li>מתאים לצוותים וסוכנויות</li>
              </ul>
              <button type="button" className="primary" onClick={login}>התחילו ליצור</button>
            </article>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden>P2</span>
          <strong>Prompt2Spot</strong>
        </div>
        <p>מערכת AI להפקת סרטונים עסקיים — מרעיון ועד רינדור.</p>
      </footer>
    </div>
  );
}
