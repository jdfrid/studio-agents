import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiPost } from "./api.js";
import type { ProjectRunView } from "./types.js";
import { correctionCreditCost } from "@studio/shared";

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
  const { t, i18n } = useTranslation("run");
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
      const action = t(rerunFrom === "asset" ? "corrections.regenerateVisuals" : "corrections.rerender");
      const label = t("corrections.creditNotice", {
        action,
        credits: formatCredits(correctionCreditCost(rerunFrom), i18n.resolvedLanguage)
      });
      if (label && !window.confirm(t("corrections.confirmation", { label }))) return;
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
  const assetCredits = formatCredits(assetCost, i18n.resolvedLanguage);
  const renderCredits = formatCredits(renderCost, i18n.resolvedLanguage);

  return (
    <section className="visual-corrections-panel">
      <header className="panel-header">
        <h3>{t("corrections.title")}</h3>
        <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
          {t(open ? "common.close" : "common.open")}
        </button>
      </header>
      {!open ? (
        <p className="muted">{t("corrections.collapsed")}</p>
      ) : (
        <>
          <label>
            {t("corrections.characterDescription")}
            <textarea rows={3} value={characterBible} onChange={(e) => setCharacterBible(e.target.value)} />
          </label>
          <label>
            {t("corrections.corrections")}
            <textarea
              rows={2}
              value={corrections}
              onChange={(e) => setCorrections(e.target.value)}
              placeholder={t("corrections.placeholder")}
            />
          </label>
          {scenes.length > 0 ? (
            <details className="scene-overrides">
              <summary>{t("corrections.byScene")}</summary>
              {scenes.map((scene) => (
                <label key={scene.id}>
                  {t("common.scene", { number: scene.order + 1 })}: {scene.title}
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
            <p className="muted">{t("corrections.completedHint", { assetCredits, renderCredits })}</p>
          ) : null}
          {error ? <p className="error-inline">{error}</p> : null}
          <div className="stage-actions">
            <button type="button" disabled={busy} onClick={() => void apply(null)}>
              {t("common.save")}
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => void apply("asset")}>
              {busy
                ? "…"
                : assetCost > 0
                  ? t("corrections.withCredits", { action: t("corrections.regenerateVisuals"), credits: assetCredits })
                  : t("corrections.regenerateVisuals")}
            </button>
            <button type="button" disabled={busy} onClick={() => void apply("render")}>
              {renderCost > 0
                ? t("corrections.withCredits", { action: t("corrections.rerender"), credits: renderCredits })
                : t("corrections.rerender")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function formatCredits(value: number, language?: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
}
