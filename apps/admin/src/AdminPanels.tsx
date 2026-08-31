import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "./api.js";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  freeVideosLimit: number | null;
  freeVideosAllowance: number;
  freeVideosRemaining: number;
  plan: string;
  videosCompleted: number;
  videosFailed: number;
  revenueNis: number;
  costNis: number;
  marginNis: number;
  lastLoginIp: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

type UserPnl = {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    credits: number;
    freeVideosLimit: number | null;
    freeVideosAllowance: number;
    freeVideosRemaining: number;
    lastLoginIp: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  };
  revenueNis: number;
  costNis: number;
  marginNis: number;
  loginEvents: Array<{ id: string; ipAddress: string; userAgent: string | null; createdAt: string }>;
  runs: Array<{ id: string; status: string; title: string; updatedAt: string }>;
};

type UserEditForm = {
  name: string;
  role: "USER" | "ADMIN";
  /** empty string = platform default; otherwise integer */
  freeVideosLimit: string;
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
    void apiGet<Dashboard>("/admin/dashboard")
      .then(setDash)
      .catch(() => setDash(null));
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
    void apiGet<PlatformSettingsView>("/admin/settings")
      .then(setSettings)
      .catch(() => setSettings(null));
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
      <p className="muted">
        שינויים חלים על סרטונים חדשים. עדכון אחרון: {new Date(settings.updatedAt).toLocaleString("he-IL")}
      </p>

      <label>
        מודל רינדור ללקוחות
        <select
          value={settings.defaultRenderProfile}
          onChange={(e) =>
            setSettings({
              ...settings,
              defaultRenderProfile: e.target.value as PlatformSettingsView["defaultRenderProfile"]
            })
          }
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">הלקוחות לא בוחרים מודל — כל סרטון חדש משתמש בפרופיל הזה.</p>

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
          וידאו (Gemini Omni / Veo)
          <input
            value={settings.geminiVideoModel ?? ""}
            placeholder="gemini-omni-1.1-flash-preview"
            onChange={(e) => setSettings({ ...settings, geminiVideoModel: e.target.value || null })}
          />
          <small className="muted">
            מזהה וידאו של Google: Gemini Omni 1.1 Flash (Preview) או Veo. ספקי Wan/Kling/Hailuo נבחרים ב«מודל
            רינדור ללקוחות» למעלה (דורש FAL_API_KEY).
          </small>
        </label>
      </fieldset>

      <label>
        מספר סרטונים חינם לכל משתמש
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={settings.freeVideosPerUser}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value));
            setSettings({ ...settings, freeVideosPerUser: Number.isFinite(n) && n > 0 ? n : 0 });
          }}
        />
        <small className="muted">
          0 = בלי סרטונים חינם כברירת מחדל. אפשר לדרוס לכל משתמש בנפרד במסך «משתמשים» (למשל 100 לבדיקות שלך, 2
          לאחרים).
        </small>
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
  defaultRenderProfile:
    | "omni-multiclip"
    | "veo-multiclip"
    | "veo-extend"
    | "kling-i2v"
    | "kling-avatar-i2v"
    | "wan-i2v"
    | "hailuo-i2v"
    | "heygen-i2v"
    | "seedance-mini-i2v"
    | "seedance-fast-i2v"
    | "seedance-i2v"
    | "luma-ray-i2v";
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
    { id: "omni-multiclip" as const, label: "Gemini Omni 1.1 Flash — ברירת מחדל (~$0.10/ש׳)" },
    { id: "veo-multiclip" as const, label: "Veo Fast — multiclip (היסטורי)" },
    { id: "wan-i2v" as const, label: "Wan 2.7 — זול (מתמונה, ~$0.10/ש׳ @720p)" },
    { id: "kling-avatar-i2v" as const, label: "Kling Avatar — סנכרון שפתיים (~$0.056/ש׳)" },
    { id: "hailuo-i2v" as const, label: "Hailuo — זול (מתמונה)" },
    { id: "seedance-mini-i2v" as const, label: "Seedance 2 Mini — זול בכמויות (~$0.16/ש׳)" },
    { id: "luma-ray-i2v" as const, label: "Luma Ray 3.2 — מתמונה (~$0.30/5ש׳)" },
    { id: "seedance-fast-i2v" as const, label: "Seedance 2 Fast (~$0.29/ש׳)" },
    { id: "seedance-i2v" as const, label: "Seedance 2 — איכות מלאה (~$0.36/ש׳)" },
    { id: "kling-i2v" as const, label: "Kling 2.1 — image-to-video" },
    { id: "heygen-i2v" as const, label: "HeyGen — סנכרון שפתיים (יקר יותר)" },
    { id: "veo-extend" as const, label: "Veo Fast — extend chain (יקר יותר)" }
  ];
}

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pnl, setPnl] = useState<UserPnl | null>(null);
  const [edit, setEdit] = useState<UserEditForm>({ name: "", role: "USER", freeVideosLimit: "" });
  const [adjust, setAdjust] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function reloadUsers() {
    setUsers(await apiGet<AdminUser[]>("/admin/users"));
  }

  useEffect(() => {
    void reloadUsers();
  }, []);

  useEffect(() => {
    if (!selected) {
      setPnl(null);
      return;
    }
    void apiGet<UserPnl>(`/admin/users/${selected}/pnl`)
      .then((data) => {
        setPnl(data);
        setEdit({
          name: data.user.name ?? "",
          role: data.user.role as "USER" | "ADMIN",
          freeVideosLimit: data.user.freeVideosLimit == null ? "" : String(data.user.freeVideosLimit)
        });
      })
      .catch(() => setPnl(null));
  }, [selected]);

  async function saveUser() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const limitRaw = edit.freeVideosLimit.trim();
      let freeVideosLimit: number | null = null;
      if (limitRaw !== "") {
        const n = Math.floor(Number(limitRaw));
        if (!Number.isFinite(n) || n < 0) {
          setMessage("מכסת סרטונים חינם חייבת להיות מספר שלם ≥ 0, או ריק לברירת מחדל.");
          return;
        }
        freeVideosLimit = n;
      }
      await apiPatch(`/admin/users/${selected}`, {
        name: edit.name.trim() || null,
        role: edit.role,
        freeVideosLimit
      });
      await reloadUsers();
      const data = await apiGet<UserPnl>(`/admin/users/${selected}/pnl`);
      setPnl(data);
      setMessage("נשמר בהצלחה.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyCredits(userId: string) {
    const delta = Number(adjust);
    if (!Number.isFinite(delta) || delta === 0) return;
    setBusy(true);
    try {
      await apiPost(`/admin/users/${userId}/credits`, { delta, note: "admin adjust" });
      setAdjust("");
      await reloadUsers();
      if (selected === userId) {
        const data = await apiGet<UserPnl>(`/admin/users/${userId}/pnl`);
        setPnl(data);
      }
    } finally {
      setBusy(false);
    }
  }

  function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("he-IL");
  }

  return (
    <section className="admin-users">
      <h3>משתמשים</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>אימייל</th>
            <th>שם</th>
            <th>תפקיד</th>
            <th>קרדיטים</th>
            <th>סרטונים חינם</th>
            <th>IP אחרון</th>
            <th>התחברות אחרונה</th>
            <th>רווח</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={selected === u.id ? "selected" : ""} onClick={() => setSelected(u.id)}>
              <td>{u.email}</td>
              <td>{u.name ?? "—"}</td>
              <td>{u.role === "ADMIN" ? "מנהל" : "משתמש"}</td>
              <td>{u.credits}</td>
              <td>
                {u.freeVideosRemaining}/{u.freeVideosAllowance}
                {u.freeVideosLimit == null ? <small className="muted"> (ברירת מחדל)</small> : null}
              </td>
              <td>{u.lastLoginIp ?? "—"}</td>
              <td>{formatWhen(u.lastLoginAt)}</td>
              <td>₪{u.marginNis.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && pnl ? (
        <div className="user-detail">
          <h4>עריכת משתמש</h4>
          <p className="muted">אימייל (Google): {pnl.user.email}</p>
          <div className="user-edit-grid">
            <label>
              שם תצוגה
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label>
              תפקיד
              <select
                value={edit.role}
                onChange={(e) => setEdit({ ...edit, role: e.target.value as "USER" | "ADMIN" })}
              >
                <option value="USER">משתמש</option>
                <option value="ADMIN">מנהל</option>
              </select>
            </label>
            <label>
              מכסת סרטונים חינם
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                placeholder="ברירת מחדל מההגדרות"
                value={edit.freeVideosLimit}
                onChange={(e) => setEdit({ ...edit, freeVideosLimit: e.target.value })}
              />
              <small className="muted">
                ריק = ברירת מחדל מהפלטפורמה. 0 = בלי חינם. מספר גבוה (למשל 100) לבדיקות שלך. נותרו{" "}
                {pnl.user.freeVideosRemaining}/{pnl.user.freeVideosAllowance}.
              </small>
            </label>
          </div>
          <div className="stage-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void saveUser()}>
              {busy ? "שומר…" : "שמור שינויים"}
            </button>
          </div>
          {message ? (
            <p className={message.includes("בהצלחה") ? "muted" : "error-inline"}>{message}</p>
          ) : null}

          <h4>קרדיטים ו-P&amp;L</h4>
          <p>
            הכנסות ₪{pnl.revenueNis.toFixed(0)} · עלות ₪{pnl.costNis.toFixed(0)} · רווח ₪
            {pnl.marginNis.toFixed(0)} · קרדיטים {pnl.user.credits}
          </p>
          <label>
            התאמת קרדיטים (+/-)
            <input value={adjust} onChange={(e) => setAdjust(e.target.value)} />
          </label>
          <button type="button" disabled={busy} onClick={() => void applyCredits(selected)}>
            החל קרדיטים
          </button>

          <h4>היסטוריית התחברות (IP)</h4>
          <table className="admin-table login-events-table">
            <thead>
              <tr>
                <th>תאריך ושעה</th>
                <th>IP</th>
                <th>דפדפן</th>
              </tr>
            </thead>
            <tbody>
              {pnl.loginEvents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    אין רישומים — יופיע אחרי התחברות הבאה.
                  </td>
                </tr>
              ) : (
                pnl.loginEvents.map((e) => (
                  <tr key={e.id}>
                    <td>{formatWhen(e.createdAt)}</td>
                    <td>{e.ipAddress}</td>
                    <td className="ua-cell">{e.userAgent ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h4>סרטונים אחרונים</h4>
          <ul className="user-runs-list">
            {pnl.runs.slice(0, 10).map((r) => (
              <li key={r.id}>
                <strong>{r.title || "(ללא כותרת)"}</strong> — {r.status} — {formatWhen(r.updatedAt)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
