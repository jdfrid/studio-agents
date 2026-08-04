import { useEffect, useMemo, useState } from "react";
import { apiPost } from "./api.js";
import type { ProjectRunView } from "./types.js";
import { correctionCreditCost } from "@studio/shared";
import { correctionLabel, formatCredits } from "./creditsUi.js";

type ScriptScene = {
  id: string;
  order: number;
  title: string;
};

export function VisualCorrectionsPanel({
  runId,
  scriptOutput,
  runStatus,
  onSaved
}: {
  runId: string;
  scriptOutput: {
    characterBible?: string;
    visualCorrections?: string;
    scenes?: ScriptScene[];
  };
  runStatus?: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [characterBible, setCharacterBible] = useState(String(scriptOutput.characterBible ?? ""));
  const [corrections, setCorrections] = useState(String(scriptOutput.visualCorrections ?? ""));
  const [sceneOverrides, setSceneOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const scenes = useMemo(() => scriptOutput.scenes ?? [], [scriptOutput.scenes]);
  const isCompleted = runStatus === "COMPLETED";

  useEffect(() => {
    setCharacterBible(String(scriptOutput.characterBible ?? ""));
    setCorrections(String(scriptOutput.visualCorrections ?? ""));
  }, [scriptOutput.characterBible, scriptOutput.visualCorrections]);

  async function apply(rerunFrom: "asset" | "render" | null) {
    if (isCompleted && rerunFrom) {
      const label = correctionLabel(rerunFrom);
      if (label && !window.confirm(`${label}. להמשיך?`)) return;
    }
    setBusy(true);
    setError("");
    try {
      const overrides = scenes
        .map((scene) => ({
          sceneId: scene.id,
          visualNotes: (sceneOverrides[scene.id] ?? "").trim()
        }))
        .filter((row) => row.visualNotes.length > 0);

      await apiPost<ProjectRunView>(`/runs/${runId}/visual-corrections`, {
        characterBible: characterBible.trim() || undefined,
        corrections: corrections.trim() || undefined,
        sceneOverrides: overrides.length ? overrides : undefined,
        rerunFrom
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const assetCost = isCompleted ? correctionCreditCost("asset") : 0;
  const renderCost = isCompleted ? correctionCreditCost("render") : 0;

  return (
    <section className="visual-corrections-panel">
      <header className="panel-header">
        <h3>תיקונים ויזואליים</h3>
        <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
          {open ? "סגור" : "פתח"}
        </button>
      </header>
      {!open ? (
        <p className="muted">שנה מראה דמויות (שיער, כובע, לבוש) והפעל מחדש.</p>
      ) : (
        <>
          <label>
            תיאור דמויות
            <textarea rows={3} value={characterBible} onChange={(e) => setCharacterBible(e.target.value)} />
          </label>
          <label>
            תיקונים
            <textarea
              rows={2}
              value={corrections}
              onChange={(e) => setCorrections(e.target.value)}
              placeholder="בלי שער מצח, עם כובע…"
            />
          </label>
          {scenes.length > 0 ? (
            <details className="scene-overrides">
              <summary>תיקון לפי סצנה</summary>
              {scenes.map((scene) => (
                <label key={scene.id}>
                  סצנה {scene.order + 1}: {scene.title}
                  <textarea
                    rows={2}
                    value={sceneOverrides[scene.id] ?? ""}
                    onChange={(e) => setSceneOverrides({ ...sceneOverrides, [scene.id]: e.target.value })}
                  />
                </label>
              ))}
            </details>
          ) : null}
          {isCompleted ? (
            <p className="muted">
              אחרי סרטון מוכן: ויזואל מחדש = {formatCredits(correctionCreditCost("asset"))} קרדיט (תמונות),
              רינדור מחדש = {formatCredits(correctionCreditCost("render"))} קרדיט (וידאו בלבד). סרטון חינמי —
              תיקונים ללא עלות. שמור רק שומר הערות בלי להריץ מחדש.
            </p>
          ) : null}
          {error ? <p className="error-inline">{error}</p> : null}
          <div className="stage-actions">
            <button type="button" disabled={busy} onClick={() => void apply(null)}>
              שמור
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => void apply("asset")}>
              {busy ? "…" : assetCost > 0 ? `ויזואל מחדש (${formatCredits(assetCost)} קרדיט)` : "ויזואל מחדש"}
            </button>
            <button type="button" disabled={busy} onClick={() => void apply("render")}>
              {renderCost > 0 ? `רינדור מחדש (${formatCredits(renderCost)} קרדיט)` : "רינדור מחדש"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
