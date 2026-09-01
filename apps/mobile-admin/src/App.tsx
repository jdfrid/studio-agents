import { useCallback, useEffect, useMemo, useState } from "react";
import { Browser } from "@capacitor/browser";
import {
  api,
  type AdminUser,
  type Dashboard,
  type OperationalMetrics,
  type ProviderAlert,
  type ProviderMonitor
} from "./api";
import { beginLogin, listenForLogin, logout, restoreSession } from "./auth";
import {
  formatCurrency,
  formatFreshness,
  localizedAlert,
  monitorRisk,
  providerLabel,
  statusLabel
} from "./monitoringUi";
import { registerPushNotifications } from "./push";

type Screen = "overview" | "users" | "activity" | "providers" | "alerts" | "settings";
type ProviderSection = "PAID_PROVIDER" | "SYSTEM_INFRASTRUCTURE";
const tabs: Array<{ id: Screen; label: string }> = [
  { id: "overview", label: "סקירה" },
  { id: "users", label: "משתמשים" },
  { id: "activity", label: "עלויות" },
  { id: "providers", label: "ספקים" },
  { id: "alerts", label: "התראות" },
  { id: "settings", label: "ספים" }
];

function money(value: number) {
  return formatCurrency(value, "ILS");
}

function Login({ error }: { error: string }) {
  return (
    <main className="login">
      <div className="brand">P2S</div>
      <h1>ניהול Prompt2Spot</h1>
      <p>אפליקציה פרטית למנהלי המערכת בלבד</p>
      {error && <div className="error">{error}</div>}
      <button className="primary" onClick={() => void beginLogin()}>
        התחברות מאובטחת עם Google
      </button>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <article className={`stat ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<Screen>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [providers, setProviders] = useState<ProviderMonitor[]>([]);
  const [providerSection, setProviderSection] = useState<ProviderSection>("PAID_PROVIDER");
  const [alerts, setAlerts] = useState<ProviderAlert[]>([]);
  const [metrics, setMetrics] = useState<OperationalMetrics | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const loadOverview = useCallback(async () => {
    const [summary, providerRows, alertPage] = await Promise.all([
      api<Dashboard>("/admin/dashboard"),
      api<ProviderMonitor[]>("/admin/providers"),
      api<{ items: ProviderAlert[] }>("/admin/alerts?pageSize=10&status=OPEN")
    ]);
    setDashboard(summary);
    setProviders(providerRows);
    setAlerts(alertPage.items);
  }, []);

  const loadScreen = useCallback(async () => {
    if (!authenticated) return;
    setBusy(true);
    setError("");
    try {
      if (screen === "overview" || screen === "providers" || screen === "settings") await loadOverview();
      if (screen === "users") {
        const result = await api<{ items: AdminUser[]; total: number }>(
          `/admin/users?page=${page}&pageSize=25&search=${encodeURIComponent(search)}`
        );
        setUsers(result.items);
        setTotalUsers(result.total);
      }
      if (screen === "activity") {
        setMetrics(await api<OperationalMetrics>(`/admin/metrics?from=${from}&to=${to}T23:59:59.999Z`));
      }
      if (screen === "alerts") {
        setAlerts((await api<{ items: ProviderAlert[] }>("/admin/alerts?pageSize=100")).items);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "טעינת הנתונים נכשלה");
    } finally {
      setBusy(false);
    }
  }, [authenticated, from, loadOverview, page, screen, search, to]);

  useEffect(() => {
    void restoreSession().then(setAuthenticated);
    const listener = listenForLogin((ok, message) => {
      setAuthenticated(ok);
      setError(message ?? "");
    });
    return () => void listener.then((handle) => handle.remove());
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void loadScreen();
    void registerPushNotifications(() => void loadOverview()).catch(() => undefined);
  }, [authenticated, loadOverview, loadScreen]);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => void loadOverview(), 30_000);
    return () => window.clearInterval(timer);
  }, [authenticated, loadOverview]);

  const critical = useMemo(
    () => alerts.filter((item) => item.status === "OPEN" && item.severity === "CRITICAL").length,
    [alerts]
  );
  const sortedProviders = useMemo(
    () =>
      [...providers].sort(
        (a, b) =>
          monitorRisk(a).rank - monitorRisk(b).rank ||
          providerLabel(a.provider).localeCompare(providerLabel(b.provider), "he")
      ),
    [providers]
  );
  if (authenticated === null) return <main className="login">טוען…</main>;
  if (!authenticated) return <Login error={error} />;

  async function refreshProviders() {
    setBusy(true);
    try {
      await api("/admin/providers/refresh", { method: "POST", body: "{}" });
      await loadOverview();
    } finally {
      setBusy(false);
    }
  }

  async function openBilling(provider: string) {
    const { url } = await api<{ url: string }>(`/admin/providers/${provider}/billing-link`, {
      method: "POST",
      body: "{}"
    });
    await Browser.open({ url, presentationStyle: "popover" });
  }

  async function acknowledge(id: string) {
    await api(`/admin/alerts/${id}/acknowledge`, { method: "POST", body: "{}" });
    await loadScreen();
  }

  async function saveThresholds(monitor: ProviderMonitor, warning: string, criticalValue: string) {
    await api(`/admin/providers/${monitor.id}/thresholds`, {
      method: "PATCH",
      body: JSON.stringify({
        warningThreshold: warning === "" ? null : Number(warning),
        criticalThreshold: criticalValue === "" ? null : Number(criticalValue)
      })
    });
    await loadOverview();
  }

  return (
    <div className="app-shell">
      <header>
        <div>
          <small>Prompt2Spot</small>
          <h1>{tabs.find((tab) => tab.id === screen)?.label}</h1>
        </div>
        <button className="icon" aria-label="רענון" onClick={() => void loadScreen()}>
          ↻
        </button>
      </header>
      {critical > 0 && (
        <button className="critical-banner" onClick={() => setScreen("alerts")}>
          {critical} התראות קריטיות דורשות טיפול
        </button>
      )}
      {error && <div className="error">{error}</div>}
      <main className={busy ? "loading content" : "content"}>
        {screen === "overview" && dashboard && (
          <>
            <section className="stats">
              <Stat label="משתמשים" value={String(dashboard.users)} />
              <Stat label="הכנסות" value={money(dashboard.revenueNis)} tone="positive" />
              <Stat label="עלויות" value={money(dashboard.costNis)} />
              <Stat
                label="רווח"
                value={money(dashboard.marginNis)}
                tone={dashboard.marginNis >= 0 ? "positive" : "negative"}
              />
              <Stat label="סרטונים" value={String(dashboard.videosCompleted)} />
              <Stat label="הצלחה" value={`${Math.round(dashboard.successRate * 100)}%`} />
            </section>
            <h2>דורש תשומת לב</h2>
            {alerts.length === 0 ? (
              <p className="empty">אין התראות פתוחות</p>
            ) : (
              alerts
                .slice(0, 5)
                .map((alert) => <AlertCard key={alert.id} alert={alert} onAck={acknowledge} />)
            )}
          </>
        )}
        {screen === "users" && (
          <>
            <div className="toolbar">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="חיפוש לפי שם או דוא״ל"
              />
              <span>{totalUsers} משתמשים</span>
            </div>
            <section className="list">
              {users.map((user) => (
                <article className="card" key={user.id}>
                  <strong dir="ltr">{user.email}</strong>
                  <span>
                    {user.name ?? "ללא שם"} · {user.role}
                  </span>
                  <div className="row">
                    <span>וידאו: {user.videosCompleted}</span>
                    <span>הכנסה: {money(user.revenueNis)}</span>
                    <span>עלות: {money(user.costNis)}</span>
                  </div>
                </article>
              ))}
            </section>
            <div className="pager">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                הקודם
              </button>
              <span>{page}</span>
              <button disabled={page * 25 >= totalUsers} onClick={() => setPage(page + 1)}>
                הבא
              </button>
            </div>
          </>
        )}
        {screen === "activity" && (
          <>
            <div className="date-range">
              <label>
                מ־
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                עד
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {metrics && (
              <>
                <section className="stats">
                  <Stat label="הכנסות" value={money(metrics.totals.revenueNis)} />
                  <Stat label="עלויות" value={money(metrics.totals.costNis)} />
                  <Stat label="הושלמו" value={String(metrics.totals.completed)} />
                  <Stat label="נכשלו" value={String(metrics.totals.failed)} />
                </section>
                <h2>שירותים</h2>
                <section className="list">
                  {metrics.services.map((service) => (
                    <article className="card" key={service.service}>
                      <strong>{service.service}</strong>
                      <span>
                        {service.events} פעולות · {money(service.costNis)}
                      </span>
                    </article>
                  ))}
                </section>
              </>
            )}
          </>
        )}
        {screen === "providers" && (
          <>
            <div className="section-tabs" role="tablist" aria-label="סוג שירות">
              <button
                className={providerSection === "PAID_PROVIDER" ? "active" : ""}
                onClick={() => setProviderSection("PAID_PROVIDER")}
              >
                ספקים בתשלום
              </button>
              <button
                className={providerSection === "SYSTEM_INFRASTRUCTURE" ? "active" : ""}
                onClick={() => setProviderSection("SYSTEM_INFRASTRUCTURE")}
              >
                תשתיות המערכת
              </button>
            </div>
            <button className="primary compact" onClick={() => void refreshProviders()}>
              בדיקה מחדש
            </button>
            <section className="list">
              {sortedProviders
                .filter((provider) => provider.category === providerSection)
                .map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} onBilling={openBilling} />
                ))}
            </section>
          </>
        )}
        {screen === "alerts" && (
          <section className="list">
            {alerts.length ? (
              alerts.map((alert) => <AlertCard key={alert.id} alert={alert} onAck={acknowledge} />)
            ) : (
              <p className="empty">אין התראות</p>
            )}
          </section>
        )}
        {screen === "settings" && (
          <section className="list">
            {providers.map((provider) => (
              <ThresholdCard key={provider.id} provider={provider} onSave={saveThresholds} />
            ))}
          </section>
        )}
      </main>
      <nav>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={screen === tab.id ? "active" : ""}
            onClick={() => setScreen(tab.id)}
          >
            {tab.label}
            {tab.id === "alerts" && critical > 0 ? <b>{critical}</b> : null}
          </button>
        ))}
      </nav>
      <button className="logout" onClick={() => void logout().then(() => setAuthenticated(false))}>
        התנתקות וביטול המכשיר
      </button>
    </div>
  );
}

function AlertCard({ alert, onAck }: { alert: ProviderAlert; onAck: (id: string) => Promise<void> }) {
  const text = localizedAlert(alert);
  const technicalMessage = alert.metadata?.technicalMessage ?? alert.message;
  return (
    <article className={`card alert ${alert.severity.toLowerCase()}`}>
      <div className="row">
        <strong>{text.title}</strong>
        <span>
          {statusLabel(alert.status)} · {formatFreshness(alert.lastSeenAt)}
        </span>
      </div>
      <p>{text.message}</p>
      <small>{text.action}</small>
      {technicalMessage && (
        <details>
          <summary>פרטים טכניים</summary>
          <pre dir="ltr">{technicalMessage}</pre>
        </details>
      )}
      {alert.status === "OPEN" && alert.severity !== "RECOVERY" && (
        <button onClick={() => void onAck(alert.id)}>סימון כטופל</button>
      )}
    </article>
  );
}

function ProviderCard({
  provider,
  onBilling
}: {
  provider: ProviderMonitor;
  onBilling: (provider: string) => Promise<void>;
}) {
  const snapshot = provider.snapshots[0];
  const details = snapshot?.details ?? {};
  const risk = monitorRisk(provider);
  const monetary = provider.metricType === "BALANCE" && provider.lastValue !== null;
  const currency = provider.unit?.toUpperCase() === "USD" ? "USD" : "ILS";
  const value = monetary
    ? formatCurrency(provider.lastValue!, currency)
    : provider.metricType === "QUOTA" && provider.lastValue !== null
      ? provider.unit === "USD spending capacity"
        ? `${formatCurrency(provider.lastValue, "USD")} עד תקרת ההוצאה`
        : `${provider.lastValue.toLocaleString("he-IL")} ${provider.unit === "characters" ? "תווים" : provider.unit?.toLowerCase() === "credits" ? "קרדיטים" : "יחידות"}`
      : risk.className === "disabled"
        ? "לא מוגדר — אופציונלי"
        : !snapshot
          ? provider.configured
            ? "מחובר — ממתין לבדיקה"
            : "חסר חיבור"
          : snapshot?.healthy === false
            ? "הבדיקה נכשלה"
            : "השירות זמין";
  const estimatedSpend = typeof details.estimatedCostNis24h === "number" ? details.estimatedCostNis24h : null;
  const unavailableReason =
    typeof details.balanceUnavailableReason === "string"
      ? details.balanceUnavailableReason
      : provider.metricType === "SERVICE_HEALTH"
        ? "זהו שירות תשתית ללא יתרת ארנק שניתנת לקריאה; המדד הזמין הוא תקינות השירות."
        : "ה‑API הרשמי אינו מספק יתרה כספית עבור סוג החשבון הזה.";
  const technicalDetails =
    typeof details.failureReason === "string" ? details.failureReason : provider.lastErrorMessage;
  return (
    <article className={`card provider ${risk.className}`}>
      <div className="row">
        <strong>{provider.company}</strong>
        <span className={`risk ${risk.className}`}>{risk.label}</span>
      </div>
      <span>{providerLabel(provider.provider, provider.displayName)}</span>
      <small>שימוש במערכת: {provider.capability}</small>
      <small>
        {monetary ? "יתרה כספית רשמית" : provider.metricType === "QUOTA" ? "מכסה שנותרה" : "מצב השירות"}
      </small>
      <b>{value}</b>
      {provider.estimatedRunwayHours !== null && (
        <span>זמן משוער עד גמר: {provider.estimatedRunwayHours.toFixed(1)} שעות</span>
      )}
      {provider.category === "PAID_PROVIDER" && !monetary && unavailableReason && (
        <span>יתרה כספית: לא זמינה — {unavailableReason}</span>
      )}
      {estimatedSpend !== null && (
        <span>עלות פנימית משוערת ב־24 שעות: {formatCurrency(estimatedSpend, "ILS")}</span>
      )}
      <small>
        עודכן {formatFreshness(provider.lastCheckedAt)} · {provider.sourceRealtime ? "נתון ישיר" : "אומדן"}
      </small>
      {technicalDetails && (
        <details>
          <summary>פרטים טכניים</summary>
          <pre dir="ltr">{technicalDetails}</pre>
        </details>
      )}
      {provider.billingUrl && (
        <button onClick={() => void onBilling(provider.provider)}>פתיחת חשבון וחיוב באתר הרשמי</button>
      )}
    </article>
  );
}

function ThresholdCard({
  provider,
  onSave
}: {
  provider: ProviderMonitor;
  onSave: (provider: ProviderMonitor, warning: string, critical: string) => Promise<void>;
}) {
  const [warning, setWarning] = useState(provider.warningThreshold?.toString() ?? "");
  const [criticalValue, setCritical] = useState(provider.criticalThreshold?.toString() ?? "");
  return (
    <article className="card">
      <strong>{providerLabel(provider.provider, provider.displayName)}</strong>
      <small>
        ספים עבור{" "}
        {provider.metricType === "QUOTA"
          ? "מכסה שנותרה"
          : provider.metricType === "BALANCE"
            ? "יתרה כספית"
            : "מדד השירות"}
      </small>
      <div className="thresholds">
        <label>
          אזהרה
          <input type="number" min="0" value={warning} onChange={(e) => setWarning(e.target.value)} />
        </label>
        <label>
          קריטי
          <input type="number" min="0" value={criticalValue} onChange={(e) => setCritical(e.target.value)} />
        </label>
      </div>
      <button onClick={() => void onSave(provider, warning, criticalValue)}>שמירת ספים</button>
    </article>
  );
}
