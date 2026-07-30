import { useState } from "react";
import { apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
import type { ProjectRunView } from "./types.js";
import type { ApprovalMode } from "@studio/shared";

export function CreateVideoForm({ onCreated, onCancel }: { onCreated: (run: ProjectRunView) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const canCreate = user?.canCreateVideo ?? false;
  const freeLeft = user?.freeVideosRemaining ?? 0;
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("auto");
  const [visualFiles, setVisualFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      const run = await apiPost<ProjectRunView>("/runs", {
        brief: {
          title,
          sourceText: prompt,
          language: "he",
          durationSeconds,
          aspectRatio: "9:16",
          budgetMode: true,
          approvalMode,
          attachments
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
        <input type="number" min={5} max={60} value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value) || 30)} />
      </label>
      <fieldset className="approval-fieldset">
        <legend>מצב יצירה</legend>
        <label>
          <input type="radio" checked={approvalMode === "auto"} onChange={() => setApprovalMode("auto")} />
          הרץ הכל אוטומטית
        </label>
        <label>
          <input type="radio" checked={approvalMode === "auto_until_render"} onChange={() => setApprovalMode("auto_until_render")} />
          עצור לפני הסרטון הסופי
        </label>
        <label>
          <input type="radio" checked={approvalMode === "manual"} onChange={() => setApprovalMode("manual")} />
          המתן לאישור בכל שלב
        </label>
      </fieldset>
      {error ? <p className="error-inline">{error}</p> : null}
      <div className="stage-actions">
        <button type="button" className="primary" disabled={busy || !canCreate || !title.trim() || !prompt.trim()} onClick={() => void submit()}>
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
