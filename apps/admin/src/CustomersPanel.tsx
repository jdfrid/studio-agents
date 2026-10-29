import { useEffect, useMemo, useState } from "react";
import { statusLabelHe } from "@studio/shared";
import { apiGet } from "./api.js";
import { RunPublicLink } from "./RunPublicLink.js";

type SubscriptionInfo = {
  planType: string;
  status: string;
  creditsPerMonth: number;
  periodStart: string;
  periodEnd: string;
  monthsInPeriod: number;
  monthlyGrantsGiven: number;
  monthlyGrantsRemaining: number;
  willRenew: boolean;
} | null;

type Customer = {
  id: string;
  email: string;
  name: string | null;
  registeredAt: string;
  firstPaymentAt: string | null;
  lastPaymentAt: string | null;
  paymentsCount: number;
  refundedCount: number;
  totalPaidNis: number;
  totalPaidUsd: number;
  lastPlanType: string | null;
  provider: string | null;
  subscription: SubscriptionInfo;
  credits: number;
  creditsBought: number;
  creditsUsed: number;
  videosCompleted: number;
  videosTotal: number;
  lastActivityAt: string | null;
};

type CustomerDetail = {
  user: { id: string; email: string; name: string | null; registeredAt: string; lastLoginAt: string | null; credits: number };
  subscription: SubscriptionInfo;
  payments: Array<{
    id: string;
    at: string;
    planType: string;
    status: string;
    provider: string;
    kind: "purchase" | "renewal" | "other";
    reference: string;
    amountNis: number;
    amountUsd: number;
    creditsGranted: number;
  }>;
  ledger: Array<{ id: string; at: string; reason: string; delta: number; balanceAfter: number; runId: string | null }>;
  runs: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    correction: boolean;
    automation: boolean;
    creditsCharged: number;
  }>;
};

const PLAN_LABELS: Record<string, string> = {
  PAYG: "סרטון בודד",
  STARTER: "מנוי חודשי",
  BUSINESS: "מנוי שנתי",
  SUBSCRIPTION: "מנוי (ישן)"
};

const SUB_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעיל",
  CANCELLED: "בוטל — פעיל עד סוף התקופה",
  PAST_DUE: "תשלום נכשל",
  EXPIRED: "הסתיים"
};

const PAYMENT_STATUS_LABELS: Record<string, string> = { paid: "שולם", refunded: "הוחזר", pending: "ממתין" };

const LEDGER_LABELS: Record<string, string> = {
  PURCHASE: "רכישה",
  SUBSCRIPTION_GRANT: "הקצאת מנוי",
  RUN_RESERVE: "שריון לסרטון",
  RUN_COMPLETED: "חיוב סרטון",
  RUN_RELEASE: "החזר שריון",
  CORRECTION: "תיקון",
  REFUND: "החזר כספי",
  ADMIN_ADJUST: "התאמת מנהל"
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("he-IL") : "—";
}

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("he-IL") : "—";
}

function money(usd: number, nis: number): string {
  return `$${usd.toFixed(2)} (₪${nis.toFixed(0)})`;
}

function subscriptionSummary(sub: SubscriptionInfo): string {
  if (!sub) return "—";
  const status = SUB_STATUS_LABELS[sub.status] ?? sub.status;
  const plan = PLAN_LABELS[sub.planType] ?? sub.planType;
  if (sub.monthsInPeriod > 1) {
    return `${plan} · ${status} · נותרו ${sub.monthlyGrantsRemaining} מתוך ${sub.monthsInPeriod} הקצאות חודשיות`;
  }
  return `${plan} · ${status}${sub.willRenew ? ` · מתחדש ב-${day(sub.periodEnd)}` : ` · עד ${day(sub.periodEnd)}`}`;
}

export function CustomersPanel() {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet<{ items: Customer[] }>("/admin/customers");
      setItems(res.items);
    } catch (err) {
      setError((err as Error).message || "טעינת הלקוחות נכשלה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    setDetail(null);
    void apiGet<CustomerDetail>(`/admin/customers/${selected}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selected]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((c) => c.email.toLowerCase().includes(term) || (c.name ?? "").toLowerCase().includes(term));
  }, [items, search]);

  const totals = useMemo(
    () => ({
      customers: items.length,
      usd: items.reduce((s, c) => s + c.totalPaidUsd, 0),
      activeSubs: items.filter((c) => c.subscription && (c.subscription.status === "ACTIVE" || c.subscription.monthlyGrantsRemaining > 0)).length
    }),
    [items]
  );

  return (
    <section className="admin-users customers-panel">
      <div className="users-toolbar">
        <h3>לקוחות משלמים</h3>
        <input
          type="search"
          className="users-search"
          placeholder="חיפוש לפי אימייל או שם"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "טוען…" : "רענון"}
        </button>
      </div>
      <p className="muted">
        {totals.customers} לקוחות · סה״כ שולם ${totals.usd.toFixed(2)} · {totals.activeSubs} מנויים פעילים
      </p>
      {error ? <p className="error-inline">{error}</p> : null}
      {!loading && items.length === 0 && !error ? <p className="muted">עדיין אין לקוחות משלמים.</p> : null}
      {visible.length > 0 ? (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>לקוח</th>
                <th>מסלול אחרון</th>
                <th>איך שילם</th>
                <th>תשלום ראשון</th>
                <th>תשלום אחרון</th>
                <th>תשלומים</th>
                <th>סה״כ שולם</th>
                <th>מנוי</th>
                <th>קרדיטים שנקנו</th>
                <th>נוצלו</th>
                <th>יתרה</th>
                <th>סרטונים</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className={selected === c.id ? "selected" : ""} onClick={() => setSelected(c.id)}>
                  <td>
                    {c.email}
                    {c.name ? <small className="muted"><br />{c.name}</small> : null}
                  </td>
                  <td>{c.lastPlanType ? PLAN_LABELS[c.lastPlanType] ?? c.lastPlanType : "—"}</td>
                  <td>{c.provider ?? "—"}</td>
                  <td>{when(c.firstPaymentAt)}</td>
                  <td>{when(c.lastPaymentAt)}</td>
                  <td>
                    {c.paymentsCount}
                    {c.refundedCount > 0 ? <small className="muted"> ({c.refundedCount} הוחזרו)</small> : null}
                  </td>
                  <td>{money(c.totalPaidUsd, c.totalPaidNis)}</td>
                  <td>{subscriptionSummary(c.subscription)}</td>
                  <td>{c.creditsBought}</td>
                  <td>{c.creditsUsed}</td>
                  <td>
                    <strong>{c.credits}</strong>
                    <small className="muted"><br />≈ {Math.floor(c.credits / 40)} סרטונים</small>
                  </td>
                  <td title="הושלמו / סה״כ">
                    {c.videosCompleted} / {c.videosTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <div className="user-detail">
          {!detail ? (
            <p className="muted">טוען פרטי לקוח…</p>
          ) : (
            <>
              <div className="users-toolbar">
                <h4>
                  {detail.user.email}
                  {detail.user.name ? ` · ${detail.user.name}` : ""}
                </h4>
                <button type="button" onClick={() => setSelected(null)}>
                  סגור
                </button>
              </div>
              <p className="muted">
                נרשם {when(detail.user.registeredAt)} · התחברות אחרונה {when(detail.user.lastLoginAt)} · יתרה{" "}
                <strong>{detail.user.credits}</strong> קרדיטים
              </p>
              <p>
                <strong>מנוי:</strong> {subscriptionSummary(detail.subscription)}
                {detail.subscription ? (
                  <small className="muted">
                    {" "}
                    · {detail.subscription.creditsPerMonth} קרדיטים לחודש · תקופה {day(detail.subscription.periodStart)}–
                    {day(detail.subscription.periodEnd)}
                  </small>
                ) : null}
              </p>

              <h4>תשלומים ({detail.payments.length})</h4>
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>מתי</th>
                      <th>מסלול</th>
                      <th>סוג</th>
                      <th>ספק</th>
                      <th>סכום</th>
                      <th>קרדיטים</th>
                      <th>סטטוס</th>
                      <th>אסמכתא</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{when(p.at)}</td>
                        <td>{PLAN_LABELS[p.planType] ?? p.planType}</td>
                        <td>{p.kind === "renewal" ? "חידוש מנוי" : p.kind === "purchase" ? "רכישה" : "—"}</td>
                        <td>{p.provider}</td>
                        <td>{money(p.amountUsd, p.amountNis)}</td>
                        <td>{p.creditsGranted}</td>
                        <td>{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</td>
                        <td className="mono-cell">{p.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4>סרטונים ({detail.runs.length})</h4>
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>נוצר</th>
                      <th>כותרת</th>
                      <th>סטטוס</th>
                      <th>סוג</th>
                      <th>קרדיטים שחויבו</th>
                      <th>עודכן</th>
                      <th>קישור</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.runs.map((r) => (
                      <tr key={r.id}>
                        <td>{when(r.createdAt)}</td>
                        <td>{r.title || "(ללא כותרת)"}</td>
                        <td>{statusLabelHe(r.status)}</td>
                        <td>{r.automation ? "אוטומציה" : r.correction ? "תיקון" : "רגיל"}</td>
                        <td>{r.creditsCharged}</td>
                        <td>{when(r.updatedAt)}</td>
                        <td><RunPublicLink runId={r.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4>תנועות קרדיטים (אחרונות {detail.ledger.length})</h4>
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>מתי</th>
                      <th>סיבה</th>
                      <th>שינוי</th>
                      <th>יתרה אחרי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.ledger.map((e) => (
                      <tr key={e.id}>
                        <td>{when(e.at)}</td>
                        <td>{LEDGER_LABELS[e.reason] ?? e.reason}</td>
                        <td className={e.delta >= 0 ? "delta-plus" : "delta-minus"}>
                          {e.delta >= 0 ? `+${e.delta}` : e.delta}
                        </td>
                        <td>{e.balanceAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
