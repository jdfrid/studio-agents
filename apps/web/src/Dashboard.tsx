import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";

type RunSummary = {
  id: string;
  title: string;
  status: string;
  currentStage: string | null;
  updatedAt: string;
};

export function Dashboard({
  onNewVideo,
  onOpenRun
}: {
  onNewVideo: () => void;
  onOpenRun: (id: string) => void;
}) {
  const { user, refresh } = useAuth();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState("");

  useEffect(() => {
    void apiGet<RunSummary[]>("/runs").then(setRuns).catch(() => setRuns([]));
  }, []);

  async function buy(plan: "payg" | "subscription") {
    setBusy(plan);
    setPurchaseError("");
    try {
      const { checkoutUrl } = await apiPost<{ checkoutUrl: string }>("/billing/checkout", { plan });
      window.location.href = checkoutUrl;
    } catch (err) {
      setPurchaseError((err as Error).message || "לא ניתן לפתוח דף תשלום כרגע.");
    } finally {
      setBusy(null);
    }
  }

  const credits = user?.credits ?? 0;
  const freeLeft = user?.freeVideosRemaining ?? 0;
  const canCreate = user?.canCreateVideo ?? false;
  const billingReady = user?.billingConfigured ?? false;
  const showPurchase = credits < 1 && freeLeft < 1;

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <h2>שלום{user?.name ? `, ${user.name}` : ""}</h2>
          <p className="credits-badge">
            {freeLeft > 0
              ? freeLeft === 1
                ? "נותר סרטון חינם אחד"
                : `נותרו ${freeLeft} סרטונים חינם`
              : `${formatCredits(credits)} קרדיטים זמינים`}
          </p>
        </div>
        <button type="button" className="primary" disabled={!canCreate} onClick={onNewVideo}>
          + סרטון חדש
        </button>
      </header>

      {freeLeft > 0 ? (
        <section className="billing-banner billing-banner-free">
          <p>
            {freeLeft === 1 ? (
              <>
                יש לך <strong>סרטון חינם אחד</strong>. לחץ &quot;סרטון חדש&quot; כדי להתחיל.
              </>
            ) : (
              <>
                יש לך <strong>{freeLeft} סרטונים חינם</strong>. לחץ &quot;סרטון חדש&quot; כדי להתחיל.
              </>
            )}
          </p>
        </section>
      ) : null}

      {showPurchase ? (
        <section className="billing-banner">
          <h3>רכישת קרדיטים</h3>
          <p>אין מספיק קרדיטים ליצירת סרטון. בחר אחת מהאפשרויות:</p>
          <div className="stage-actions billing-actions">
            <button type="button" className="primary" disabled={busy !== null || !billingReady} onClick={() => void buy("payg")}>
              {busy === "payg" ? "…" : "קנה סרטון — ₪30"}
            </button>
            <button type="button" disabled={busy !== null || !billingReady} onClick={() => void buy("subscription")}>
              {busy === "subscription" ? "…" : "מנוי חודשי — ₪600"}
            </button>
          </div>
          {!billingReady ? (
            <p className="muted billing-note">מערכת התשלומים בהגדרה — נסה שוב בקרוב או פנה לתמיכה.</p>
          ) : null}
          {purchaseError ? <p className="error-inline">{purchaseError}</p> : null}
        </section>
      ) : credits >= 1 ? (
        <section className="billing-banner billing-banner-compact">
          <p>יש לך קרדיטים — אפשר ליצור סרטון חדש.</p>
          <div className="stage-actions">
            <button type="button" disabled={busy !== null || !billingReady} onClick={() => void buy("payg")}>
              {busy === "payg" ? "…" : "+ קנה עוד סרטון"}
            </button>
            <button type="button" disabled={busy !== null || !billingReady} onClick={() => void buy("subscription")}>
              {busy === "subscription" ? "…" : "מנוי חודשי"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="runs-grid">
        <h3>הסרטונים שלי</h3>
        {runs.length === 0 ? <p className="muted">עדיין לא יצרת סרטונים.</p> : null}
        <ul className="run-cards">
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" className="run-card" onClick={() => onOpenRun(r.id)}>
                <strong>{r.title}</strong>
                <span className={`status-pill status-${r.status.toLowerCase()}`}>{statusHe(r.status)}</span>
                <small>{new Date(r.updatedAt).toLocaleString("he-IL")}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button type="button" className="link-btn" onClick={() => void refresh()}>
        רענן קרדיטים
      </button>
    </div>
  );
}

function formatCredits(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function statusHe(status: string): string {
  const map: Record<string, string> = {
    RUNNING: "רץ",
    COMPLETED: "הושלם",
    FAILED: "נכשל",
    AWAITING_APPROVAL: "ממתין",
    DRAFT: "טיוטה",
    CANCELLED: "בוטל"
  };
  return map[status] ?? status;
}
