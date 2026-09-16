import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiPatch } from "./api.js";
import { correctionCreditCost } from "@studio/shared";
import type { ProjectRunView } from "./types.js";

type SceneDraft = {
  id: string;
  order: number;
  title: string;
  narration: string;
  visualPrompt: string;
  veoPrompt: string;
  durationSeconds: number;
  speakerName?: string;
  location?: string;
  action?: string;
};

function scenesFromOutput(output: unknown): SceneDraft[] {
  if (!output || typeof output !== "object") return [];
  const scenes = (output as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes)) return [];
  return scenes.map((raw, index) => {
    const scene = raw as Record<string, unknown>;
    return {
      id: String(scene.id ?? `scene-${index}`),
      order: Number(scene.order ?? index),
      title: String(scene.title ?? ""),
      narration: String(scene.narration ?? ""),
      visualPrompt: String(scene.visualPrompt ?? ""),
      veoPrompt: String(scene.veoPrompt ?? scene.visualPrompt ?? ""),
      durationSeconds: Number(scene.durationSeconds ?? 8),
      speakerName: scene.speakerName ? String(scene.speakerName) : "",
      location: scene.location ? String(scene.location) : "",
      action: scene.action ? String(scene.action) : ""
    };
  });
}

export function SceneEditor({
  runId,
  scriptOutput,
  onSaved,
  onClose
}: {
  runId: string;
  scriptOutput: unknown;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("run");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [index, setIndex] = useState(0);
  const [scenes, setScenes] = useState(() => scenesFromOutput(scriptOutput));
  const [applyAll, setApplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scene = scenes[index];
  const assetCost = correctionCreditCost("asset");
  const renderCost = correctionCreditCost("render");

  useEffect(() => {
    titleRef.current?.focus();
  }, [index]);

  function updateScene(patch: Partial<SceneDraft>) {
    setScenes((current) =>
      current.map((item, i) => {
        if (i !== index) {
          if (applyAll && patch.speakerName !== undefined) return { ...item, speakerName: patch.speakerName };
          return item;
        }
        const next = { ...item, ...patch };
        if (patch.visualPrompt && !patch.veoPrompt) {
          next.veoPrompt = patch.visualPrompt.slice(0, 1600);
        }
        return next;
      })
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const output = scriptOutput && typeof scriptOutput === "object" ? { ...(scriptOutput as Record<string, unknown>) } : {};
      const original = Array.isArray(output.scenes) ? (output.scenes as Array<Record<string, unknown>>) : [];
      output.scenes = original.map((row, i) => {
        const draft = scenes[i];
        if (!draft) return row;
        return {
          ...row,
          title: draft.title.trim() || row.title,
          narration: draft.narration,
          visualPrompt: draft.visualPrompt.trim() || row.visualPrompt,
          veoPrompt: (draft.veoPrompt || draft.visualPrompt).slice(0, 1600),
          durationSeconds: draft.durationSeconds,
          speakerName: draft.speakerName?.trim() || undefined,
          location: draft.location?.trim() || undefined,
          action: draft.action?.trim() || undefined
        };
      });
      output.totalDurationSeconds = scenes.reduce((sum, item) => sum + item.durationSeconds, 0);
      await apiPatch<ProjectRunView>(`/runs/${runId}/stages/script/output`, output);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!scene) return null;

  return (
    <div className="scene-editor-overlay" role="dialog" aria-modal="true" aria-labelledby="scene-editor-title">
      <div className="scene-editor">
        <header className="scene-editor-header">
          <h2 id="scene-editor-title" tabIndex={-1} ref={titleRef}>
            {t("sceneEditor.title", { number: index + 1, total: scenes.length })}
          </h2>
          <button type="button" className="button-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </header>
        <p className="muted">{t("sceneEditor.help")}</p>
        <label className="field-block">
          {t("sceneEditor.sceneTitle")}
          <input value={scene.title} maxLength={120} onChange={(e) => updateScene({ title: e.target.value })} />
        </label>
        <label className="field-block">
          {t("sceneEditor.narration")}
          <textarea rows={4} value={scene.narration} maxLength={800} onChange={(e) => updateScene({ narration: e.target.value })} />
        </label>
        <label className="field-block">
          {t("sceneEditor.visual")}
          <textarea rows={4} value={scene.visualPrompt} maxLength={1200} onChange={(e) => updateScene({ visualPrompt: e.target.value })} />
        </label>
        <div className="common-fields-grid">
          <label className="field-block">
            {t("sceneEditor.character")}
            <input
              value={scene.speakerName ?? ""}
              maxLength={80}
              onChange={(e) => updateScene({ speakerName: e.target.value })}
            />
            <small className="field-help">{t("sceneEditor.globalHint")}</small>
          </label>
          <label className="field-block">
            {t("sceneEditor.location")}
            <input
              value={scene.location ?? ""}
              maxLength={120}
              onChange={(e) => updateScene({ location: e.target.value })}
            />
          </label>
          <label className="field-block">
            {t("sceneEditor.action")}
            <input
              value={scene.action ?? ""}
              maxLength={200}
              onChange={(e) => updateScene({ action: e.target.value })}
            />
          </label>
          <label className="field-block">
            {t("sceneEditor.duration")}
            <input
              type="number"
              min={4}
              max={16}
              value={scene.durationSeconds}
              onChange={(e) => updateScene({ durationSeconds: Math.min(16, Math.max(4, Number(e.target.value) || 8)) })}
            />
          </label>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
          {t("sceneEditor.applyAll", { count: scenes.length })}
        </label>
        <p className="muted">{t("sceneEditor.applyAllHelp", { count: scenes.length })}</p>
        <p className="muted">{t("sceneEditor.costHint", { asset: assetCost, render: renderCost })}</p>
        {error ? <p className="error-inline">{error}</p> : null}
        <div className="scene-editor-nav">
          <button type="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>
            {t("sceneEditor.previous")}
          </button>
          <button type="button" disabled={index >= scenes.length - 1} onClick={() => setIndex((value) => value + 1)}>
            {t("sceneEditor.next")}
          </button>
        </div>
        <div className="stage-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
            {busy ? t("common.save") : t("sceneEditor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
