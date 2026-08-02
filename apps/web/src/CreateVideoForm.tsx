import { useMemo, useState } from "react";
import { apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
import type { ProjectRunView } from "./types.js";
import {
  CREATIVE_FIELD_DEFS,
  listCheapRenderProfiles,
  type ApprovalMode,
  type CreativeOptions,
  type RenderProfileId
} from "@studio/shared";

export function CreateVideoForm({ onCreated, onCancel }: { onCreated: (run: ProjectRunView) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const canCreate = user?.canCreateVideo ?? false;
  const freeLeft = user?.freeVideosRemaining ?? 0;
  const cheapProfiles = useMemo(() => listCheapRenderProfiles(), []);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("auto");
  const [renderProfile, setRenderProfile] = useState<RenderProfileId>(cheapProfiles[0]?.id ?? "veo-multiclip");
  const [visualFiles, setVisualFiles] = useState<File[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [creative, setCreative] = useState<CreativeOptions>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setCreativeField<K extends keyof CreativeOptions>(key: K, value: CreativeOptions[K] | "") {
    setCreative((prev) => {
      const next = { ...prev };
      if (value === "" || value == null) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  async function submit() {
    if (!canCreate) {
      setError("אין מספיק קרדיטים ליצירת סרטון. רכוש קרדיטים או השתמש בסרטון החינמי מהדשבורד.");
      return;
    }
    if (!title.trim() || !prompt.trim()) return;
    setBusy(true);
    setError("");
    try {
      const attachments = await Promise.all(
        visualFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || "image/png",
          kind: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
          role: "anchor" as const,
          dataUrl: await fileToDataUrl(file)
        }))
      );
      const creativePayload =
        Object.keys(creative).length > 0 ? creative : undefined;
      const run = await apiPost<ProjectRunView>("/runs", {
        brief: {
          title,
          sourceText: prompt,
          language: "he",
          durationSeconds,
          aspectRatio: "9:16",
          budgetMode: true,
          approvalMode,
          renderProfile,
          attachments,
          ...(creativePayload ? { creative: creativePayload } : {})
        }
      });
      onCreated(run);
    } catch (err) {
      const e = err as Error & { code?: string };
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="create-form">
      <h2>סרטון חדש</h2>
      {freeLeft > 0 ? (
        <p className="billing-banner-free create-free-note">סרטון חינם — לא יגבה קרדיט מהיתרה שלך.</p>
      ) : null}
      <label>
        כותרת
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם הסרטון" />
      </label>
      <label>
        מה תרצה לראות בסרטון?
        <textarea
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="תאר את הסרטון — דמויות, מקום, פעולה, סגנון…"
        />
      </label>
      <label className="file-row">
        תמונות השראה (אופציונלי)
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setVisualFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      <label>
        משך (שניות)
        <input
          type="number"
          min={5}
          max={60}
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(Number(e.target.value) || 30)}
        />
      </label>
      <label>
        שירות רינדור (זולים)
        <select value={renderProfile} onChange={(e) => setRenderProfile(e.target.value as RenderProfileId)}>
          {cheapProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.labelHe}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="approval-fieldset">
        <legend>מצב יצירה</legend>
        <label>
          <input type="radio" checked={approvalMode === "auto"} onChange={() => setApprovalMode("auto")} />
          הרץ הכל אוטומטית
        </label>
        <label>
          <input
            type="radio"
            checked={approvalMode === "auto_until_render"}
            onChange={() => setApprovalMode("auto_until_render")}
          />
          עצור לפני הסרטון הסופי
        </label>
        <label>
          <input type="radio" checked={approvalMode === "manual"} onChange={() => setApprovalMode("manual")} />
          המתן לאישור בכל שלב
        </label>
      </fieldset>

      <button
        type="button"
        className="advanced-toggle"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        <span className={`advanced-chevron ${advancedOpen ? "open" : ""}`} aria-hidden>
          ▾
        </span>
        מתקדם
      </button>
      {advancedOpen ? (
        <div className="advanced-panel">
          <p className="muted advanced-hint">שדות אופציונליים — משפיעים על סגנון, קריינות, צילום ומוזיקה.</p>
          <div className="advanced-grid">
            {CREATIVE_FIELD_DEFS.map((field) => (
              <label key={field.key}>
                {field.labelHe}
                {field.kind === "number" ? (
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    value={creative[field.key] == null ? "" : String(creative[field.key])}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw) {
                        setCreativeField(field.key, "");
                        return;
                      }
                      setCreativeField(field.key, Number(raw) as never);
                    }}
                    placeholder={field.unit ? `${field.min}–${field.max} ${field.unit}` : undefined}
                  />
                ) : (
                  <select
                    value={String(creative[field.key] ?? "")}
                    onChange={(e) => setCreativeField(field.key, (e.target.value || "") as never)}
                  >
                    <option value="">— בחירה —</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.labelHe}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="error-inline">{error}</p> : null}
      <div className="stage-actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !canCreate || !title.trim() || !prompt.trim()}
          onClick={() => void submit()}
        >
          {busy ? "יוצר…" : "התחל יצירה"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
