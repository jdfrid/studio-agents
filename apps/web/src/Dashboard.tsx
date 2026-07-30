import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
import type { UserView } from "@studio/shared";

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

  useEffect(() => {
    void apiGet<RunSummary[]>("/runs").then(setRuns).catch(() => setRuns([]));
  }, []);

  async function buy(plan: "payg" | "subscription") {
    setBusy(plan);
    try {
      const { checkoutUrl } = await apiPost<{ checkoutUrl: string }>("/billing/checkout", { plan });
      window.location.href = checkoutUrl;
    } finally {
      setBusy(null);
    }
  }

  const credits = user?.credits ?? 0;

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <h2>שלום{user?.name ? `, ${user.name}` : ""}</h2>
          <p className="credits-badge">{formatCredits(credits)} קרדיטים זמינים</p>
        </div>
        <button type="button" className="primary" onClick={onNewVideo}>
          + סרטון חדש
        </button>
      </header>

      {credits < 1 ? (
        <section className="billing-banner">
          <p>אין מספיק קרדיטים ליצירת סרטון.</p>
          <div className="stage-actions">
            <button type="button" disabled={busy !== null} onClick={() => void buy("payg")}>
              {busy === "payg" ? "…" : "קנה סרטון — ₪30"}
            </button>
            <button type="button" className="primary" disabled={busy !== null} onClick={() => void buy("subscription")}>
              {busy === "subscription" ? "…" : "מנוי חודשי — ₪600"}
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
