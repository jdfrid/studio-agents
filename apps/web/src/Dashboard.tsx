import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { apiDelete, apiGet, apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
import { formatDate, formatNumber } from "./i18n/format.js";

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
  const { t, i18n } = useTranslation();
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
    if (!window.confirm(t("dashboard.deleteConfirm", { title }))) return;
    setDeletingId(id);
    try {
      await apiDelete(`/runs/${id}`);
      await refreshRuns();
    } catch (err) {
      window.alert((err as Error).message || t("dashboard.deleteFailed"));
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
      setPurchaseError((err as Error).message || t("dashboard.purchaseError"));
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
          <p className="eyebrow">{t("dashboard.studio")}</p>
          <h1>{t("dashboard.hello")}{user?.name ? `, ${user.name}` : ""}</h1>
          <p className="muted">{t("dashboard.description")}</p>
        </div>
        <div className="dash-header-actions">
          <div className="credit-summary">
            <span className="credit-summary-icon" aria-hidden>✦</span>
            <span>
              <small>{t("dashboard.availableBalance")}</small>
              <strong>
                {freeLeft > 0
                  ? t("dashboard.freeVideos", { count: freeLeft })
                  : t("dashboard.credits", { count: formatNumber(credits) })}
              </strong>
            </span>
          </div>
          <button type="button" className="primary button-large" disabled={!canCreate} onClick={onNewVideo}>
            <span aria-hidden>＋</span>
            {t("dashboard.newVideo")}
          </button>
        </div>
      </header>

      {freeLeft > 0 ? (
        <section className="billing-banner billing-banner-free">
          <span className="banner-icon" aria-hidden>🎬</span>
          <p>
            <Trans i18nKey="dashboard.freeBanner" count={freeLeft} components={{ strong: <strong /> }} />
          </p>
        </section>
      ) : null}

      {showPurchase ? (
        <section className="billing-banner">
          <div>
            <p className="eyebrow">{t("dashboard.continueCreating")}</p>
            <h3>{t("dashboard.outOfCredits")}</h3>
            <p>{t("dashboard.choosePlan")}</p>
          </div>
          <div className="stage-actions billing-actions">
            <button type="button" className="primary" disabled={busy !== null || !billingReady} onClick={() => void buy("payg")}>
              {busy === "payg" ? t("dashboard.openingPayment") : t("dashboard.singlePrice")}
            </button>
            <button type="button" disabled={busy !== null || !billingReady} onClick={() => void buy("subscription")}>
              {busy === "subscription" ? t("dashboard.openingPayment") : t("dashboard.subscriptionPrice")}
            </button>
          </div>
          {!billingReady ? (
            <p className="muted billing-note">{t("dashboard.billingUnavailable")}</p>
          ) : null}
          {purchaseError ? <p className="error-inline">{purchaseError}</p> : null}
        </section>
      ) : credits >= 1 ? (
        <section className="billing-banner billing-banner-compact">
          <p>{t("dashboard.haveCredits")}</p>
          <div className="stage-actions">
            <button type="button" disabled={busy !== null || !billingReady} onClick={() => void buy("payg")}>
              {busy === "payg" ? "…" : t("dashboard.buyAnother")}
            </button>
            <button type="button" disabled={busy !== null || !billingReady} onClick={() => void buy("subscription")}>
              {busy === "subscription" ? "…" : t("dashboard.monthlySubscription")}
            </button>
          </div>
        </section>
      ) : null}

      <section className="runs-grid">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">{t("dashboard.recentProjects")}</p>
            <h2>{t("dashboard.myVideos")}</h2>
          </div>
          <button type="button" className="button-secondary refresh-button" onClick={() => void refreshRuns()}>
            <span aria-hidden>↻</span>
            {t("dashboard.refresh")}
          </button>
        </div>
        {runs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden>▶</span>
            <h3>{t("dashboard.emptyTitle")}</h3>
            <p>{t("dashboard.emptyBody")}</p>
            <button type="button" className="primary" disabled={!canCreate} onClick={onNewVideo}>
              {t("dashboard.createFirst")}
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
                    <span className={`status-pill status-${r.status.toLowerCase()}`}>
                      {t(`dashboard.statuses.${r.status}`, { defaultValue: r.status })}
                    </span>
                  </span>
                  <small>
                    {t("dashboard.updated", { date: formatDate(r.updatedAt) })}
                    {r.currentStage ? ` · ${t("dashboard.stage", { stage: r.currentStage })}` : ""}
                  </small>
                </span>
                <span className="run-card-arrow" aria-hidden>{i18n.dir() === "rtl" ? "←" : "→"}</span>
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
                {deletingId === r.id ? t("dashboard.deleting") : t("dashboard.delete")}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="link-btn dashboard-credit-refresh" onClick={() => void refresh()}>
        {t("dashboard.refreshCredits")}
      </button>
    </div>
  );
}
