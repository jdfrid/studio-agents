import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";

type UsageWindow = { operations: number; costUsd: number; costNis: number };
type UsageBucket = { today: UsageWindow; week: UsageWindow; month: UsageWindow };

type ServiceRow = {
  provider: string;
  displayName: string;
  company: string;
  capability: string;
  category: "PAID_PROVIDER" | "SYSTEM_INFRASTRUCTURE";
  configured: boolean;
  status: string;
  healthy: boolean | null;
  metricType: string;
  balance: number | null;
  unit: string | null;
  estimatedRunwayHours: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  balanceNote: string | null;
  details: Record<string, unknown>;
  billingUrl: string | null;
  usedByActiveVideoModel: boolean;
  usage: UsageBucket;
};

type ServicesOverview = {
  generatedAt: string;
  activeRenderProfile: { id: string; label: string };
  totals: UsageBucket;
  runsToday: Record<string, number>;
  services: ServiceRow[];
  videoModels: Array<{
    id: string;
    label: string;
    provider: string;
    model: string;
    perSecondUsd: number;
    active: boolean;
    available: boolean;
  }>;
  aiModels: Array<{ role: string; label: string; provider: string; model: string }>;
  models: Array<{ key: string; provider: string; activityType: string; model: string; usage: UsageBucket }>;
};

const REFRESH_MS = 20_000;

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  HEALTHY: { label: "תקין", tone: "ok" },
  DEGRADED: { label: "תקלה", tone: "bad" },
  PERMISSION_ERROR: { label: "בעיית הרשאה", tone: "bad" },
  NOT_CONFIGURED: { label: "לא מוגדר", tone: "off" },
  DISABLED: { label: "לא פעיל", tone: "off" },
  UNKNOWN: { label: "טרם נבדק", tone: "warn" }
};

function formatBalance(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  const u = (unit ?? "").toLowerCase();
  if (u === "usd") return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (u === "credits") return `${value.toLocaleString("he-IL")} קרדיטים`;
  if (u === "characters") return `${value.toLocaleString("he-IL")} תווים`;
  return `${value.toLocaleString("he-IL")} ${unit ?? ""}`.trim();
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "לא נבדק";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `לפני ${seconds} שנ׳`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `לפני ${hours} שע׳`;
  return new Date(iso).toLocaleString("he-IL");
}

function nis(value: number): string {
  return `₪${value.toLocaleString("he-IL", { maximumFractionDigits: value < 10 ? 2 : 0 })}`;
}

function balanceTone(row: ServiceRow): string {
  if (row.balance === null) return "";
  if (row.criticalThreshold !== null && row.balance <= row.criticalThreshold) return "bad";
  if (row.warningThreshold !== null && row.balance <= row.warningThreshold) return "warn";
  if (row.balance <= 0) return "bad";
  if (row.unit?.toUpperCase() === "USD" && row.balance < 5) return "warn";
  return "ok";
}

function extraDetails(row: ServiceRow): string[] {
  const d = row.details;
  const lines: string[] = [];
  if (row.provider === "runway") {
    if (typeof d.creditBalance === "number") lines.push(`${d.creditBalance.toLocaleString("he-IL")} קרדיטים בחשבון`);
    if (typeof d.grokDailyGenerations === "number") {
      const max = typeof d.grokMaxDailyGenerations === "number" ? ` / ${d.grokMaxDailyGenerations}` : "";
      lines.push(`Grok היום: ${d.grokDailyGenerations}${max} יצירות`);
    }
    if (typeof d.grokMaxConcurrentGenerations === "number") lines.push(`במקביל עד ${d.grokMaxConcurrentGenerations}`);
  }
  if (row.provider === "heygen" && typeof d.billingType === "string") lines.push(`סוג חיוב: ${d.billingType}`);
  if (row.provider === "elevenlabs" && typeof d.characterLimit === "number" && typeof d.characterCount === "number") {
    lines.push(`נוצלו ${d.characterCount.toLocaleString("he-IL")} מתוך ${d.characterLimit.toLocaleString("he-IL")} תווים`);
  }
  if (typeof d.latencyMs === "number") lines.push(`זמן תגובה ${d.latencyMs}ms`);
  if (row.estimatedRunwayHours !== null && row.estimatedRunwayHours < 24 * 14) {
    lines.push(`בקצב הנוכחי יספיק לעוד ~${Math.round(row.estimatedRunwayHours)} שעות`);
  }
  return lines;
}

export function ServicesPanel() {
  const [data, setData] = useState<ServicesOverview | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setData(await apiGet<ServicesOverview>("/admin/services"));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);

  async function liveCheck() {
    setChecking(true);
    try {
      await apiPost("/admin/providers/refresh");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  if (!data) return error ? <p className="error-inline">{error}</p> : <p className="muted">טוען שירותים…</p>;

  const paid = data.services.filter((s) => s.category === "PAID_PROVIDER");
  const infra = data.services.filter((s) => s.category === "SYSTEM_INFRASTRUCTURE");
  const runs = data.runsToday;
  const runsTotal = Object.values(runs).reduce((sum, n) => sum + n, 0);
  const problems = paid.filter((s) => s.configured && (STATUS_LABELS[s.status]?.tone === "bad" || balanceTone(s) === "bad"));

  return (
    <section className="services-panel">
      <header className="services-head">
        <div>
          <h2>שירותים ומודלים</h2>
          <p className="muted">
            <span className="live-dot" aria-hidden="true" /> מתעדכן אוטומטית כל {REFRESH_MS / 1000} שניות · עדכון אחרון{" "}
            {timeAgo(data.generatedAt, now)} · מודל וידאו פעיל: <strong>{data.activeRenderProfile.label}</strong>
          </p>
        </div>
        <button type="button" className="primary" disabled={checking} onClick={() => void liveCheck()}>
          {checking ? "בודק מול הספקים…" : "בדיקה חיה עכשיו"}
        </button>
      </header>
      {error ? <p className="error-inline">{error}</p> : null}
      {problems.length ? (
        <p className="services-alert" role="alert">
          שימו לב: {problems.map((p) => p.displayName).join(", ")} — יתרה נמוכה או תקלה. יצירת סרטונים חדשים שתלויים בהם
          נחסמת ומוצגת ללקוח הודעת עומס.
        </p>
      ) : null}

      <div className="kpi-grid services-kpis">
        <Kpi label="עלות היום" value={nis(data.totals.today.costNis)} sub={`$${data.totals.today.costUsd.toFixed(2)}`} />
        <Kpi label="עלות 7 ימים" value={nis(data.totals.week.costNis)} sub={`$${data.totals.week.costUsd.toFixed(2)}`} />
        <Kpi label="עלות 30 ימים" value={nis(data.totals.month.costNis)} sub={`$${data.totals.month.costUsd.toFixed(2)}`} />
        <Kpi label="פעולות היום" value={data.totals.today.operations.toLocaleString("he-IL")} sub={`${data.totals.month.operations.toLocaleString("he-IL")} ב-30 ימים`} />
        <Kpi
          label="סרטונים היום"
          value={String(runsTotal)}
          sub={`${runs.COMPLETED ?? 0} הושלמו · ${runs.FAILED ?? 0} נכשלו · ${(runs.RUNNING ?? 0) + (runs.AWAITING_APPROVAL ?? 0)} בתהליך`}
        />
      </div>

      <h3>ספקים בתשלום</h3>
      <div className="service-grid">
        {paid.map((row) => (
          <ServiceCard key={row.provider} row={row} now={now} />
        ))}
      </div>

      <h3>תשתית</h3>
      <div className="service-grid service-grid-compact">
        {infra.map((row) => (
          <ServiceCard key={row.provider} row={row} now={now} />
        ))}
      </div>

      <h3>מודלי וידאו</h3>
      <div className="table-wrap">
        <table className="services-table">
          <thead>
            <tr>
              <th>מודל</th>
              <th>ספק</th>
              <th>מזהה</th>
              <th>$ לשנייה</th>
              <th>סרטון 30 ש׳ (וידאו)</th>
              <th>זמין</th>
            </tr>
          </thead>
          <tbody>
            {data.videoModels.map((m) => (
              <tr key={m.id} className={m.active ? "row-active" : ""}>
                <td>
                  {m.label} {m.active ? <span className="badge badge-completed">פעיל</span> : null}
                </td>
                <td>{m.provider}</td>
                <td className="mono">{m.model}</td>
                <td>${m.perSecondUsd.toFixed(3)}</td>
                <td>${(m.perSecondUsd * 30).toFixed(2)}</td>
                <td>{m.available ? "✓" : <span className="muted">אין מפתח</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>מודלי AI נוספים</h3>
      <div className="table-wrap">
        <table className="services-table">
          <tbody>
            {data.aiModels.map((m) => (
              <tr key={m.role}>
                <td>{m.label}</td>
                <td>{m.provider}</td>
                <td className="mono">{m.model}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>שימוש לפי מודל</h3>
      {data.models.length ? (
        <div className="table-wrap">
          <table className="services-table">
            <thead>
              <tr>
                <th>ספק</th>
                <th>מודל</th>
                <th>פעולות היום</th>
                <th>פעולות 7 ימים</th>
                <th>פעולות 30 ימים</th>
                <th>עלות היום</th>
                <th>עלות 30 ימים</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={m.key}>
                  <td>{m.provider}</td>
                  <td className="mono">{m.model}</td>
                  <td>{m.usage.today.operations}</td>
                  <td>{m.usage.week.operations}</td>
                  <td>{m.usage.month.operations}</td>
                  <td>{nis(m.usage.today.costNis)}</td>
                  <td>{nis(m.usage.month.costNis)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">אין פעולות ב-30 הימים האחרונים.</p>
      )}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="kpi-card">
      <small>{label}</small>
      <strong>{value}</strong>
      {sub ? <small className="muted">{sub}</small> : null}
    </article>
  );
}

function ServiceCard({ row, now }: { row: ServiceRow; now: number }) {
  const status = STATUS_LABELS[row.status] ?? { label: row.status, tone: "warn" };
  const tone = balanceTone(row);
  const extras = extraDetails(row);
  const paid = row.category === "PAID_PROVIDER";
  return (
    <article className={`service-card tone-${status.tone}`}>
      <header>
        <div>
          <strong>{row.displayName}</strong>
          <small className="muted">{row.capability}</small>
        </div>
        <span className={`service-status tone-${status.tone}`}>{status.label}</span>
      </header>
      {paid ? (
        <div className="service-balance">
          <small className="muted">יתרה</small>
          <strong className={tone ? `tone-${tone}` : ""}>{formatBalance(row.balance, row.unit)}</strong>
          {row.balance === null && row.balanceNote ? <small className="muted">{row.balanceNote}</small> : null}
        </div>
      ) : null}
      {extras.length ? (
        <ul className="service-extras">
          {extras.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {paid ? (
        <dl className="service-usage">
          {(
            [
              ["היום", row.usage.today],
              ["7 ימים", row.usage.week],
              ["30 ימים", row.usage.month]
            ] as const
          ).map(([label, usage]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <span>{usage.operations.toLocaleString("he-IL")} פעולות</span>
                <span>{nis(usage.costNis)}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {row.lastError && status.tone !== "ok" ? <p className="error-inline">{row.lastError}</p> : null}
      <footer>
        <small className="muted">{timeAgo(row.lastCheckedAt, now)}</small>
        {row.usedByActiveVideoModel && paid ? <span className="badge">בשימוש בהפקה</span> : null}
        {row.billingUrl ? (
          <a href={row.billingUrl} target="_blank" rel="noreferrer">
            חיוב / טעינה ↗
          </a>
        ) : null}
      </footer>
    </article>
  );
}
