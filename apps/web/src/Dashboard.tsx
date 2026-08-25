import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "./api.js";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState("");

  async function refreshRuns() {
    try {
      setRuns(await apiGet<RunSummary[]>("/runs"));
    } catch {
      setRuns([]);
    }
  }

  useEffect(() => {
    void refreshRuns();
  }, []);

  async function deleteRun(id: string, title: string) {
    if (!window.confirm(`למחוק את «${title}»? התהליך ייעצר ולא ימשיך לנסות שוב.`)) return;
    setDeletingId(id);
    try {
      await apiDelete(`/runs/${id}`);
      await refreshRuns();
    } catch (err) {
      window.alert((err as Error).message || "מחיקה נכשלה");
    } finally {
      setDeletingId(null);
    }
  }

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
        <div className="page-heading">
          <p className="eyebrow">הסטודיו שלי</p>
          <h1>שלום{user?.name ? `, ${user.name}` : ""}</h1>
          <p className="muted">כל הסרטונים, הטיוטות ותהליכי היצירה שלכם במקום אחד.</p>
        </div>
        <div className="dash-header-actions">
          <div className="credit-summary">
            <span className="credit-summary-icon" aria-hidden>✦</span>
            <span>
              <small>יתרה זמינה</small>
              <strong>
                {freeLeft > 0
                  ? freeLeft === 1
                    ? "סרטון חינם אחד"
                    : `${freeLeft} סרטונים חינם`
                  : `${formatCredits(credits)} קרדיטים`}
              </strong>
            </span>
          </div>
          <button type="button" className="primary button-large" disabled={!canCreate} onClick={onNewVideo}>
            <span aria-hidden>＋</span>
            סרטון חדש
          </button>
        </div>
      </header>

      {freeLeft > 0 ? (
        <section className="billing-banner billing-banner-free">
          <span className="banner-icon" aria-hidden>🎬</span>
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
          <div>
            <p className="eyebrow">ממשיכים ליצור</p>
            <h3>הקרדיטים נגמרו</h3>
            <p>בחרו סרטון בודד או מסלול חודשי שמתאים לקצב שלכם.</p>
          </div>
          <div className="stage-actions billing-actions">
            <button type="button" className="primary" disabled={busy !== null || !billingReady} onClick={() => void buy("payg")}>
              {busy === "payg" ? "פותח תשלום…" : "סרטון בודד · ₪30"}
            </button>
            <button type="button" disabled={busy !== null || !billingReady} onClick={() => void buy("subscription")}>
              {busy === "subscription" ? "פותח תשלום…" : "30 סרטונים · ₪600"}
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
        <div className="section-title-row">
          <div>
            <p className="eyebrow">הפרויקטים האחרונים</p>
            <h2>הסרטונים שלי</h2>
          </div>
          <button type="button" className="button-secondary refresh-button" onClick={() => void refreshRuns()}>
            <span aria-hidden>↻</span>
            רענון
          </button>
        </div>
        {runs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden>▶</span>
            <h3>הסרטון הראשון מתחיל כאן</h3>
            <p>תארו את הרעיון, צרפו תמונות והמערכת תיקח אתכם עד לקובץ המוכן.</p>
            <button type="button" className="primary" disabled={!canCreate} onClick={onNewVideo}>
              צרו סרטון ראשון
            </button>
          </div>
        ) : null}
        <ul className="run-cards">
          {runs.map((r) => (
            <li key={r.id} className="run-card-row">
              <button type="button" className="run-card" onClick={() => onOpenRun(r.id)}>
                <span className="run-card-thumb" aria-hidden>
                  <span>▶</span>
                </span>
                <span className="run-card-content">
                  <span className="run-card-title-row">
                    <strong>{r.title}</strong>
                    <span className={`status-pill status-${r.status.toLowerCase()}`}>{statusHe(r.status)}</span>
                  </span>
                  <small>
                    עודכן {new Date(r.updatedAt).toLocaleDateString("he-IL", {
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    })}
                    {r.currentStage ? ` · שלב ${r.currentStage}` : ""}
                  </small>
                </span>
                <span className="run-card-arrow" aria-hidden>←</span>
              </button>
              <button
                type="button"
                className="link-btn run-delete-btn"
                disabled={deletingId === r.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteRun(r.id, r.title);
                }}
              >
                {deletingId === r.id ? "מוחק…" : "מחק"}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="link-btn dashboard-credit-refresh" onClick={() => void refresh()}>
        רענון יתרת קרדיטים
      </button>
    </div>
  );
}

function formatCredits(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function statusHe(status: string): string {
  const map: Record<string, string> = {
    RUNNING: "בתהליך",
    COMPLETED: "הושלם",
    FAILED: "נכשל",
    AWAITING_APPROVAL: "ממתין",
    DRAFT: "טיוטה",
    CANCELLED: "בוטל"
  };
  return map[status] ?? status;
}
