import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "./api.js";

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

export function AdminSettingsPanel() {
  const [settings, setSettings] = useState<PlatformSettingsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void apiGet<PlatformSettingsView>("/admin/settings").then(setSettings).catch(() => setSettings(null));
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiPatch<PlatformSettingsView>("/admin/settings", {
        defaultRenderProfile: settings.defaultRenderProfile,
        geminiTextModel: settings.geminiTextModel,
        geminiTtsModel: settings.geminiTtsModel,
        geminiImageModel: settings.geminiImageModel,
        geminiMusicModel: settings.geminiMusicModel,
        geminiVideoModel: settings.geminiVideoModel,
        freeVideosPerUser: settings.freeVideosPerUser
      });
      setSettings(updated);
      setMessage("נשמר בהצלחה.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <p className="muted">טוען הגדרות…</p>;

  const profiles = listRenderProfiles();

  return (
    <section className="admin-settings">
      <h3>הגדרות מערכת</h3>
      <p className="muted">שינויים חלים על סרטונים חדשים. עדכון אחרון: {new Date(settings.updatedAt).toLocaleString("he-IL")}</p>

      <label>
        פרופיל וידאו (ברירת מחדל)
        <select
          value={settings.defaultRenderProfile}
          onChange={(e) => setSettings({ ...settings, defaultRenderProfile: e.target.value as PlatformSettingsView["defaultRenderProfile"] })}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="settings-models">
        <legend>מודלי Gemini (ריק = מ-.env)</legend>
        <label>
          טקסט / תסריט
          <input
            value={settings.geminiTextModel ?? ""}
            placeholder="gemini-3.5-flash"
            onChange={(e) => setSettings({ ...settings, geminiTextModel: e.target.value || null })}
          />
        </label>
        <label>
          TTS / קול
          <input
            value={settings.geminiTtsModel ?? ""}
            placeholder="gemini-2.5-flash-preview-tts"
            onChange={(e) => setSettings({ ...settings, geminiTtsModel: e.target.value || null })}
          />
        </label>
        <label>
          תמונות
          <input
            value={settings.geminiImageModel ?? ""}
            placeholder="gemini-3.1-flash-image"
            onChange={(e) => setSettings({ ...settings, geminiImageModel: e.target.value || null })}
          />
        </label>
        <label>
          מוזיקה
          <input
            value={settings.geminiMusicModel ?? ""}
            placeholder="lyria-3-clip-preview"
            onChange={(e) => setSettings({ ...settings, geminiMusicModel: e.target.value || null })}
          />
        </label>
        <label>
          וידאו (Veo)
          <input
            value={settings.geminiVideoModel ?? ""}
            placeholder="veo-3.1-fast-generate-preview"
            onChange={(e) => setSettings({ ...settings, geminiVideoModel: e.target.value || null })}
          />
        </label>
      </fieldset>

      <label>
        סרטונים חינם למשתמש חדש
        <input
          type="number"
          min={0}
          max={100}
          value={settings.freeVideosPerUser}
          onChange={(e) => setSettings({ ...settings, freeVideosPerUser: Number(e.target.value) || 0 })}
        />
        <small className="muted">0 = כבוי. 1 = סרטון ראשון בחינם (ללא קרדיטים).</small>
      </label>

      <div className="stage-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "שומר…" : "שמור הגדרות"}
        </button>
      </div>
      {message ? <p className={message.includes("בהצלחה") ? "muted" : "error-inline"}>{message}</p> : null}
    </section>
  );
}

type PlatformSettingsView = {
  defaultRenderProfile: "veo-multiclip" | "veo-extend" | "kling-i2v";
  geminiTextModel: string | null;
  geminiTtsModel: string | null;
  geminiImageModel: string | null;
  geminiMusicModel: string | null;
  geminiVideoModel: string | null;
  freeVideosPerUser: number;
  updatedAt: string;
};

function listRenderProfiles() {
  return [
    { id: "veo-multiclip" as const, label: "Veo Fast — multiclip (ברירת מחדל)" },
    { id: "veo-extend" as const, label: "Veo Fast — extend chain" },
    { id: "kling-i2v" as const, label: "Kling 2.1 — image-to-video" }
  ];
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
