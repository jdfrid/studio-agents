import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  plan: string;
  videosCompleted: number;
  videosFailed: number;
  revenueNis: number;
  costNis: number;
  marginNis: number;
};

type Dashboard = {
  users: number;
  revenueNis: number;
  costNis: number;
  marginNis: number;
  videosCompleted: number;
  videosFailed: number;
  successRate: number;
};

export function AdminDashboardPanel() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  useEffect(() => {
    void apiGet<Dashboard>("/admin/dashboard").then(setDash).catch(() => setDash(null));
  }, []);
  if (!dash) return <p className="muted">טוען KPI…</p>;
  return (
    <section className="admin-kpi">
      <h3>סקירה</h3>
      <div className="kpi-grid">
        <Kpi label="משתמשים" value={String(dash.users)} />
        <Kpi label="הכנסות ₪" value={dash.revenueNis.toFixed(0)} />
        <Kpi label="עלות ₪" value={dash.costNis.toFixed(0)} />
        <Kpi label="רווח ₪" value={dash.marginNis.toFixed(0)} />
        <Kpi label="סרטונים הושלמו" value={String(dash.videosCompleted)} />
        <Kpi label="הצלחה %" value={`${Math.round(dash.successRate * 100)}%`} />
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pnl, setPnl] = useState<unknown>(null);
  const [adjust, setAdjust] = useState("");

  useEffect(() => {
    void apiGet<AdminUser[]>("/admin/users").then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    void apiGet(`/admin/users/${selected}/pnl`).then(setPnl).catch(() => setPnl(null));
  }, [selected]);

  async function applyCredits(userId: string) {
    const delta = Number(adjust);
    if (!Number.isFinite(delta) || delta === 0) return;
    await apiPost(`/admin/users/${userId}/credits`, { delta, note: "admin adjust" });
    setAdjust("");
    setUsers(await apiGet<AdminUser[]>("/admin/users"));
  }

  return (
    <section className="admin-users">
      <h3>משתמשים</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>אימייל</th>
            <th>קרדיטים</th>
            <th>תוכנית</th>
            <th>סרטונים</th>
            <th>הכנסות</th>
            <th>עלות</th>
            <th>רווח</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={selected === u.id ? "selected" : ""} onClick={() => setSelected(u.id)}>
              <td>{u.email}</td>
              <td>{u.credits}</td>
              <td>{u.plan}</td>
              <td>
                {u.videosCompleted} / {u.videosFailed} כשל
              </td>
              <td>₪{u.revenueNis.toFixed(0)}</td>
              <td>₪{u.costNis.toFixed(0)}</td>
              <td>₪{u.marginNis.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? (
        <div className="user-detail">
          <h4>פירוט משתמש</h4>
          <pre>{JSON.stringify(pnl, null, 2)}</pre>
          <label>
            התאמת קרדיטים (+/-)
            <input value={adjust} onChange={(e) => setAdjust(e.target.value)} />
          </label>
          <button type="button" onClick={() => void applyCredits(selected)}>
            החל
          </button>
        </div>
      ) : null}
    </section>
  );
}
