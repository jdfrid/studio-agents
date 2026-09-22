import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { apiDelete, apiGet, apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
import { formatDate, formatNumber } from "./i18n/format.js";
import {
  CREDIT_NEW_VIDEO,
  checkoutLocaleFromLanguage,
  checkoutCurrencyFromLocale,
  formatCheckoutPrice,
  type CheckoutPlanId
} from "@studio/shared";
import { canCheckoutPlan, enabledCheckoutPlansForUser } from "./checkoutPlans.js";

type RunSummary = {
  id: string;
  title: string;
  status: string;
  currentStage: string | null;
  updatedAt: string;
};

type DashFilter = "all" | "drafts" | "running" | "ready" | "action";
const SCROLL_KEY = "reelmino:dash-scroll";

export function Dashboard({
  onNewVideo,
  onOpenRun,
  onRemixRun,
  onContact
}: {
  onNewVideo: () => void;
  onOpenRun: (id: string) => void;
  onRemixRun: (id: string) => void;
  onContact: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user, refresh } = useAuth();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DashFilter>("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  async function refreshRuns() {
    try {
      setLoadError(false);
      setRuns(await apiGet<RunSummary[]>("/runs"));
    } catch {
      setLoadError(true);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshRuns();
  }, []);

  useEffect(() => {
    const saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? "0");
    if (saved) window.scrollTo(0, saved);
  }, [loading]);

  function openRun(id: string) {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    onOpenRun(id);
  }

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

  async function buy(plan: CheckoutPlanId) {
    setBusy(plan);
    setPurchaseError("");
    try {
      const { checkoutUrl } = await apiPost<{ checkoutUrl: string }>("/billing/checkout", {
        plan,
        locale: checkoutLocaleFromLanguage(i18n.resolvedLanguage)
      });
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
  const currency = checkoutCurrencyFromLocale(i18n.resolvedLanguage);
  const billingReady = enabledCheckoutPlansForUser(user, currency).length > 0;
  const showPurchase = credits < CREDIT_NEW_VIDEO && freeLeft < 1;
  const visible = useMemo(
    () =>
      runs.filter((run) => {
        if (query.trim() && !run.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
        if (filter === "drafts") return run.status === "DRAFT";
        if (filter === "running") return run.status === "RUNNING" || run.status === "QUEUED";
        if (filter === "ready") return run.status === "COMPLETED";
        if (filter === "action") return run.status === "AWAITING_APPROVAL" || run.status === "FAILED";
        return true;
      }),
    [runs, query, filter]
  );

  function cardAction(status: string): string {
    if (status === "DRAFT") return t("dashboard.continueEdit");
    if (status === "AWAITING_APPROVAL") return t("dashboard.reviewProposal");
    if (status === "COMPLETED") return t("dashboard.watch");
    return t("dashboard.watch");
  }

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
            <button
              type="button"
              className="primary"
              disabled={busy !== null || !canCheckoutPlan(user, "payg", currency)}
              title={!canCheckoutPlan(user, "payg", currency) ? t("dashboard.planUnavailable") : undefined}
              onClick={() => void buy("payg")}
            >
              {busy === "payg" ? t("dashboard.openingPayment") : t("dashboard.singlePrice", { price: formatCheckoutPrice("payg", currency) })}
            </button>
            <button
              type="button"
              disabled={busy !== null || !canCheckoutPlan(user, "starter", currency)}
              title={!canCheckoutPlan(user, "starter", currency) ? t("dashboard.planUnavailable") : undefined}
              onClick={() => void buy("starter")}
            >
              {busy === "starter" ? t("dashboard.openingPayment") : t("dashboard.starterPrice", { price: formatCheckoutPrice("starter", currency) })}
            </button>
            <button
              type="button"
              disabled={busy !== null || !canCheckoutPlan(user, "business", currency)}
              title={!canCheckoutPlan(user, "business", currency) ? t("dashboard.planUnavailable") : undefined}
              onClick={() => void buy("business")}
            >
              {busy === "business" ? t("dashboard.openingPayment") : t("dashboard.subscriptionPrice", { price: formatCheckoutPrice("business", currency) })}
            </button>
            <button type="button" className="button-secondary" onClick={onContact}>
              {t("dashboard.contactToTopUp")}
            </button>
          </div>
          {!billingReady ? (
            <p className="muted billing-note">{t("dashboard.billingUnavailable")}</p>
          ) : null}
          {purchaseError ? <p className="error-inline">{purchaseError}</p> : null}
        </section>
      ) : credits >= CREDIT_NEW_VIDEO ? (
        <section className="billing-banner billing-banner-compact">
          <p>{t("dashboard.haveCredits")}</p>
          <div className="stage-actions">
            <button
              type="button"
              disabled={busy !== null || !canCheckoutPlan(user, "payg", currency)}
              title={!canCheckoutPlan(user, "payg", currency) ? t("dashboard.planUnavailable") : undefined}
              onClick={() => void buy("payg")}
            >
              {busy === "payg" ? "…" : t("dashboard.buyAnother")}
            </button>
            <button
              type="button"
              disabled={busy !== null || !canCheckoutPlan(user, "starter", currency)}
              title={!canCheckoutPlan(user, "starter", currency) ? t("dashboard.planUnavailable") : undefined}
              onClick={() => void buy("starter")}
            >
              {busy === "starter" ? "…" : t("dashboard.starterPrice", { price: formatCheckoutPrice("starter", currency) })}
            </button>
            <button
              type="button"
              disabled={busy !== null || !canCheckoutPlan(user, "business", currency)}
              title={!canCheckoutPlan(user, "business", currency) ? t("dashboard.planUnavailable") : undefined}
              onClick={() => void buy("business")}
            >
              {busy === "business" ? "…" : t("dashboard.monthlySubscription")}
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
        <div className="dash-toolbar">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dashboard.search")}
            aria-label={t("dashboard.search")}
          />
          <div className="dash-filters" role="tablist" aria-label={t("dashboard.myVideos")}>
            {(["all", "drafts", "running", "ready", "action"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={filter === key ? "is-selected" : ""}
                onClick={() => setFilter(key)}
              >
                {t(`dashboard.filter${key === "all" ? "All" : key === "drafts" ? "Drafts" : key === "running" ? "Running" : key === "ready" ? "Ready" : "Action"}`)}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <ul className="run-cards run-cards-skeleton" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <li key={item} className="run-card-row skeleton-card" />
            ))}
          </ul>
        ) : null}
        {loadError ? (
          <div className="empty-state">
            <h3>{t("dashboard.loadingError")}</h3>
            <button type="button" className="primary" onClick={() => { setLoading(true); void refreshRuns(); }}>
              {t("dashboard.retry")}
            </button>
          </div>
        ) : null}
        {!loading && !loadError && runs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden>▶</span>
            <h3>{t("dashboard.emptyTitle")}</h3>
            <p>{t("dashboard.emptyBody")}</p>
            <button type="button" className="primary" disabled={!canCreate} onClick={onNewVideo}>
              {t("dashboard.createFirst")}
            </button>
          </div>
        ) : null}
        {!loading && !loadError && runs.length > 0 && visible.length === 0 ? (
          <div className="empty-state">
            <h3>{t("dashboard.noResults")}</h3>
          </div>
        ) : null}
        {!loading && !loadError && runs.length > 0 && visible.length > 0 ? (
          <ul className="run-cards">
            {visible.map((r) => (
              <li key={r.id} className="run-card-row">
                <button type="button" className="run-card" onClick={() => openRun(r.id)}>
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
                      {` · ${cardAction(r.status)}`}
                    </small>
                  </span>
                  <span className="run-card-arrow" aria-hidden>{i18n.dir() === "rtl" ? "←" : "→"}</span>
                </button>
                <div className="run-card-actions">
                  <button
                    type="button"
                    className="link-btn"
                    aria-label={t("dashboard.moreActions")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu((current) => (current === r.id ? null : r.id));
                    }}
                  >
                    ⋯
                  </button>
                  {openMenu === r.id ? (
                    <div className="run-card-menu">
                      {r.status === "COMPLETED" ? (
                        <button
                          type="button"
                          disabled={!canCreate}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemixRun(r.id);
                          }}
                        >
                          {t("dashboard.remix")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={deletingId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteRun(r.id, r.title);
                        }}
                      >
                        {deletingId === r.id ? t("dashboard.deleting") : t("dashboard.delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <button type="button" className="link-btn dashboard-credit-refresh" onClick={() => void refresh()}>
        {t("dashboard.refreshCredits")}
      </button>
    </div>
  );
}
