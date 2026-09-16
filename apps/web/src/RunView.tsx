import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiDelete, apiGet, apiPost } from "./api.js";
import { StageOutputView, SignedMedia } from "./StageOutputs.js";
import { StageProgressClock } from "./StageProgressClock.js";
import { VisualCorrectionsPanel } from "./VisualCorrectionsPanel.js";
import { StageErrorView } from "./StageErrorView.js";
import { StageEditor, StageUploadControls } from "./StageEditor.js";
import { SceneEditor } from "./SceneEditor.js";
import {
  STAGE_ORDER,
  formatCreativeConstraints,
  getRenderProfile,
  isRenderProfileId,
  languageCodeFromCreative
} from "@studio/shared";
import type { ArtifactRow, ProjectRunView, StageName } from "./types.js";
import { formatDateTime } from "./i18n/format.js";

type ScriptScene = {
  id: string;
  order: number;
  title: string;
  narration?: string;
  visualPrompt?: string;
  durationSeconds?: number;
};

export function RunView({
  runId,
  onBack,
  onRemix,
  canRemix,
  onDistribute,
  canDistribute,
  onOpenRun
}: {
  runId: string;
  onBack: () => void;
  onRemix: () => void;
  canRemix: boolean;
  onDistribute?: () => void;
  canDistribute?: boolean;
  onOpenRun?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("run");
  const [run, setRun] = useState<ProjectRunView | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sceneEditorOpen, setSceneEditorOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      setRun(await apiGet<ProjectRunView>(`/runs/${runId}`));
      setArtifacts(await apiGet<ArtifactRow[]>(`/runs/${runId}/artifacts`));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteThisRun() {
    if (!run) return;
    if (!window.confirm(t("run.deleteConfirm", { title: run.brief.title }))) return;
    setDeleting(true);
    try {
      await apiDelete(`/runs/${run.id}`);
      onBack();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [runId]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  if (!run) return <p className="muted">{error || t("common.loading")}</p>;

  const scriptStage = run.stages.find((s) => s.stage === "script");
  const scriptOutput = scriptStage?.output as
    | {
        characterBible?: string;
        visualCorrections?: string;
        scenes?: ScriptScene[];
      }
    | undefined;
  const scriptAwaiting = scriptStage?.status === "AWAITING_APPROVAL";
  const isComplete = run.status === "COMPLETED";
  const isFailed = run.status === "FAILED";
  const isBusy = run.status === "RUNNING";
  const currentStage = run.currentStage ? t(`stages.${run.currentStage}`, { defaultValue: run.currentStage }) : "";

  return (
    <div className="run-view">
      {isBusy || run.status === "AWAITING_APPROVAL" ? <StageProgressClock run={run} /> : null}
      <header className="run-view-header run-view-header-stack">
        <button type="button" className="button-secondary back-button" onClick={onBack}>
          <span aria-hidden>{i18n.dir() === "rtl" ? "→" : "←"}</span>
          {t("run.back")}
        </button>
        <div className="run-title-block">
          <p className="eyebrow">{t("run.projectEyebrow")}</p>
          <h1>{run.brief.title}</h1>
          <span className={`status-pill status-${run.status.toLowerCase()}`}>
            {t(`statuses.${run.status}`, { defaultValue: run.status })}
          </span>
        </div>
        <div className="run-header-menu" ref={menuRef}>
          <button
            type="button"
            className="button-secondary run-actions-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("run.actionsMenu")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {t("run.actions")}
          </button>
          {menuOpen ? (
            <div className="run-actions-menu" role="menu">
              {isComplete ? (
                <button type="button" role="menuitem" disabled={!canRemix} onClick={onRemix}>
                  {t("run.remix")}
                </button>
              ) : null}
              {isComplete && canDistribute && onDistribute ? (
                <button type="button" role="menuitem" onClick={onDistribute}>
                  {t("run.distribute")}
                </button>
              ) : null}
              <button type="button" role="menuitem" disabled={deleting} onClick={() => void deleteThisRun()}>
                {deleting ? t("run.deleting") : run.status !== "COMPLETED" ? t("run.deleteProcess") : t("run.delete")}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {isBusy ? (
        <section className="run-current-task" aria-live="polite">
          <strong>{t("run.currentTask", { stage: currentStage || t("progress.waiting") })}</strong>
          <p>{t("run.canLeave")}</p>
        </section>
      ) : null}

      {scriptAwaiting ? (
        <ProposalReview
          run={run}
          scenes={scriptOutput?.scenes ?? []}
          onApprove={() => void apiPost(`/runs/${run.id}/stages/script/approve`).then(() => refresh())}
          onEditScene={() => setSceneEditorOpen(true)}
        />
      ) : null}

      {isComplete ? (
        <CompletedResult
          run={run}
          artifacts={artifacts}
          canRemix={canRemix}
          onRemix={onRemix}
          canDistribute={canDistribute}
          onDistribute={onDistribute}
        />
      ) : null}

      {isFailed ? (
        <section className="run-failure-banner" role="alert">
          <h2>{t("run.assemblyFailed")}</h2>
          <p>{t("run.assemblyFailedHelp")}</p>
        </section>
      ) : null}

      {scriptOutput?.scenes?.length && !scriptAwaiting ? (
        <section className="proposal-scene-list">
          <div className="section-title-row">
            <h2>{t("proposal.scenesHeading")}</h2>
            <button type="button" className="button-secondary" onClick={() => setSceneEditorOpen(true)}>
              {t("sceneEditor.open")}
            </button>
          </div>
          {(scriptOutput.scenes ?? []).map((scene, index) => (
            <article key={scene.id} className="proposal-scene-card">
              <strong>
                {index + 1}. {scene.title}
              </strong>
              <p>{scene.narration}</p>
              <button type="button" className="link-btn" onClick={() => setSceneEditorOpen(true)}>
                {t("sceneEditor.edit")}
              </button>
            </article>
          ))}
        </section>
      ) : null}

      {scriptOutput?.scenes?.length ? (
        <VisualCorrectionsPanel
          runId={runId}
          scriptOutput={scriptOutput}
          runStatus={run.status}
          onSaved={(nextId) => {
            if (nextId && nextId !== runId) onOpenRun?.(nextId);
            else void refresh();
          }}
        />
      ) : null}

      <AlignDubbingPanel run={run} onDone={() => void refresh()} />

      <RunSettingsSummary run={run} artifacts={artifacts} compact={isComplete} />

      {isComplete || scriptAwaiting ? null : (
        <section className="run-progress-section" aria-labelledby="run-progress-title">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">{t("run.productionEyebrow")}</p>
              <h2 id="run-progress-title">{t("run.progressTitle")}</h2>
            </div>
          </div>
          <ol className="progress-timeline progress-timeline-stack">
            {STAGE_ORDER.map((stage) => {
              const s = run.stages.find((x) => x.stage === stage);
              const st = s?.status ?? "PENDING";
              return (
                <li key={stage} className={`timeline-step step-${st.toLowerCase()}`}>
                  <span className="step-dot" />
                  <span className="step-label">{t(`stages.${stage}`)}</span>
                  <span className="step-status">{t(`statuses.${st}`, { defaultValue: st })}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <details className="run-production-details">
        <summary>{t("run.productionDetails")}</summary>
        <div className="stage-stack">
          {STAGE_ORDER.map((stage) => (
            <UserStageCard
              key={stage}
              stage={stage}
              run={run}
              artifacts={artifacts.filter((a) => a.stage === stage)}
              onAction={() => void refresh()}
            />
          ))}
        </div>
      </details>

      {sceneEditorOpen && scriptOutput ? (
        <SceneEditor
          runId={runId}
          scriptOutput={scriptStage?.output}
          onSaved={() => void refresh()}
          onClose={() => setSceneEditorOpen(false)}
        />
      ) : null}
      {error ? <p className="error-inline">{error}</p> : null}
    </div>
  );
}

function ProposalReview({
  run,
  scenes,
  onApprove,
  onEditScene
}: {
  run: ProjectRunView;
  scenes: ScriptScene[];
          onApprove: () => void;
          onEditScene: () => void;
}) {
  const { t } = useTranslation("run");
  const [busy, setBusy] = useState(false);
  const language = languageLabel(run, t);
  return (
    <section className="proposal-review">
      <h2>{t("proposal.heading")}</h2>
      <p className="muted">
        {language} · {t("common.seconds", { count: run.brief.durationSeconds })} · {t("proposal.sceneCount", { count: scenes.length })}
      </p>
      <div className="proposal-scene-list">
        {scenes.map((scene, index) => (
          <article key={scene.id} className="proposal-scene-card">
            <strong>
              {index + 1}. {scene.title}
            </strong>
            <p>{scene.narration}</p>
            <small className="muted">{scene.visualPrompt}</small>
            <button type="button" className="link-btn" onClick={onEditScene}>
              {t("sceneEditor.edit")}
            </button>
          </article>
        ))}
      </div>
      <div className="proposal-confirm">
        <p>{t("proposal.produceHint")}</p>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onApprove();
          }}
        >
          {t("proposal.produce")}
        </button>
      </div>
    </section>
  );
}

function CompletedResult({
  run,
  artifacts,
  canRemix,
  onRemix,
  canDistribute,
  onDistribute
}: {
  run: ProjectRunView;
  artifacts: ArtifactRow[];
  canRemix: boolean;
  onRemix: () => void;
  canDistribute?: boolean;
  onDistribute?: () => void;
}) {
  const { t } = useTranslation("run");
  const [url, setUrl] = useState<string | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const candidate = useMemo(() => findFinalVideo(run, artifacts), [run, artifacts]);

  async function load() {
    setRetrying(true);
    setUnavailable(false);
    try {
      if (candidate.artifactId) {
        const res = await apiGet<{ url: string }>(`/artifacts/${candidate.artifactId}/signed-url`);
        setUrl(res.url);
        setArtifactId(candidate.artifactId);
        return;
      }
      if (candidate.signedUrl) {
        setUrl(candidate.signedUrl);
        return;
      }
      setUnavailable(true);
    } catch {
      setUnavailable(true);
      setUrl(null);
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    void load();
  }, [candidate.artifactId, candidate.signedUrl]);

  async function download() {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${run.brief.title || "video"}.mp4`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  }

  async function share() {
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: run.brief.title, url });
        return;
      }
    } catch {
      /* fall through */
    }
    await navigator.clipboard?.writeText(url);
  }

  const meta = [
    languageLabel(run, t),
    run.brief.aspectRatio === "16:9" ? t("run.settings.landscape") : t("run.settings.portrait"),
    t("run.versionOne")
  ].join(" · ");

  return (
    <section className="completed-result">
      <p className="eyebrow">{t("run.readyEyebrow")}</p>
      {unavailable || !url ? (
        <div className="media-unavailable" role="alert">
          <p>{t("outputs.fileUnavailable")}</p>
          <button type="button" className="primary" disabled={retrying} onClick={() => void load()}>
            {retrying ? t("outputs.retrying") : t("outputs.retryPlayback")}
          </button>
        </div>
      ) : (
        <SignedMedia
          label={t("outputs.finalVideo")}
          url={url}
          mimeType="video/mp4"
          onError={() => {
            if (artifactId) {
              void apiGet<{ url: string }>(`/artifacts/${artifactId}/signed-url`)
                .then((res) => setUrl(res.url))
                .catch(() => setUnavailable(true));
            } else {
              setUnavailable(true);
            }
          }}
        />
      )}
      <p className="muted">{meta}</p>
      <div className="completed-result-actions">
        <button type="button" className="primary" disabled={!url} onClick={() => void download()}>
          {t("run.download")}
        </button>
        <button type="button" className="button-secondary" disabled={!url} onClick={() => void share()}>
          {t("run.share")}
        </button>
        {canDistribute && onDistribute ? (
          <button type="button" className="button-secondary" onClick={onDistribute}>
            {t("run.distribute")}
          </button>
        ) : null}
      </div>
      <div className="completed-fix-block">
        <h3>{t("run.fixHeading")}</h3>
        <p>{t("run.fixHelp")}</p>
        <button type="button" className="button-secondary" disabled={!canRemix} onClick={onRemix}>
          {t("run.remix")}
        </button>
      </div>
    </section>
  );
}

function findFinalVideo(run: ProjectRunView, artifacts: ArtifactRow[]): { signedUrl: string | null; artifactId: string | null } {
  const series = run.stages.find((s) => s.stage === "series")?.output as { finalSignedUrl?: string; finalArtifactId?: string } | undefined;
  const render = run.stages.find((s) => s.stage === "render")?.output as { finalSignedUrl?: string; finalArtifactId?: string } | undefined;
  const artifact = artifacts.find((a) => a.kind === "final_video") ?? artifacts.find((a) => a.mimeType.startsWith("video/"));
  return {
    signedUrl: series?.finalSignedUrl || render?.finalSignedUrl || null,
    artifactId: series?.finalArtifactId || render?.finalArtifactId || artifact?.id || null
  };
}

function languageLabel(run: ProjectRunView, t: (key: string, options?: { defaultValue?: string }) => string): string {
  const code = languageCodeFromCreative(run.brief.creative) ?? run.brief.language ?? "en";
  const normalized = String(code).slice(0, 2);
  return t(`outputs.languages.${normalized}`, { defaultValue: normalized });
}

function AlignDubbingPanel({ run, onDone }: { run: ProjectRunView; onDone: () => void }) {
  const { t } = useTranslation("run");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scriptDone = run.stages.some((s) => s.stage === "script" && (s.status === "COMPLETED" || s.status === "AWAITING_APPROVAL"));
  const afterVisual = run.stages.some(
    (s) =>
      (s.stage === "package" || s.stage === "render") &&
      (s.status === "COMPLETED" || s.status === "AWAITING_APPROVAL")
  );
  const runIdle = run.status === "COMPLETED" || run.status === "FAILED" || run.status === "AWAITING_APPROVAL";
  if (!scriptDone || !afterVisual || !runIdle) return null;

  async function align() {
    if (!window.confirm(t("run.dubbing.confirm"))) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPost(`/runs/${run.id}/align-dubbing-to-visual`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="visual-corrections-panel">
      <header className="panel-header">
        <h3>{t("run.dubbing.title")}</h3>
      </header>
      <p className="muted">{t("run.dubbing.description")}</p>
      {error ? <p className="error">{error}</p> : null}
      <button type="button" className="primary" disabled={busy} onClick={() => void align()}>
        {busy ? t("run.dubbing.busy") : t("run.dubbing.action")}
      </button>
    </section>
  );
}

function defaultStageOpen(status: string): boolean {
  return status === "RUNNING" || status === "FAILED" || status === "AWAITING_APPROVAL" || status === "QUEUED";
}

function UserStageCard({
  stage,
  run,
  artifacts,
  onAction
}: {
  stage: StageName;
  run: ProjectRunView;
  artifacts: ArtifactRow[];
  onAction: () => void;
}) {
  const { t } = useTranslation("run");
  const s = run.stages.find((x) => x.stage === stage);
  const status = s?.status ?? "PENDING";
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(() => defaultStageOpen(status));

  useEffect(() => {
    if (defaultStageOpen(status)) setOpen(true);
  }, [status]);

  async function approve() {
    setBusy(true);
    try {
      await apiPost(`/runs/${run.id}/stages/${stage}/approve`);
      onAction();
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    setBusy(true);
    try {
      await apiPost(`/runs/${run.id}/stages/${stage}/rerun`);
      onAction();
    } finally {
      setBusy(false);
    }
  }

  async function openArtifact(id: string) {
    const { url } = await apiGet<{ url: string }>(`/artifacts/${id}/signed-url`);
    window.open(url, "_blank");
  }

  const showOutput = s?.output && status !== "PENDING";
  const hasBody = Boolean(s?.error || showOutput || status === "AWAITING_APPROVAL" || status === "FAILED");

  return (
    <details
      className={`stage-card stage-collapse stage-${status.toLowerCase()}`}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="stage-collapse-summary">
        <span className="stage-collapse-chevron" aria-hidden>
          ▾
        </span>
        <strong>{t(`stages.${stage}`)}</strong>
        <span className={`badge badge-${status.toLowerCase()}`}>{t(`statuses.${status}`, { defaultValue: status })}</span>
      </summary>
      <div className="stage-collapse-body">
        {!hasBody ? <p className="muted">{t("run.noStageContent")}</p> : null}
        {s?.error ? <StageErrorView error={s.error} /> : null}
        {showOutput ? (
          <>
            <StageOutputView stage={stage} output={s.output} artifacts={artifacts} onOpenArtifact={openArtifact} />
            <StageUploadControls runId={run.id} stage={stage} output={s.output} onSaved={onAction} />
            <StageEditor runId={run.id} stage={stage} output={s.output} onSaved={onAction} />
          </>
        ) : null}
        <div className="stage-actions">
          {status === "AWAITING_APPROVAL" ? (
            <button type="button" className="primary" disabled={busy} onClick={() => void approve()}>
              {busy ? "…" : t("run.approveContinue")}
            </button>
          ) : null}
          {status === "FAILED" ? (
            <button type="button" className="primary" disabled={busy} onClick={() => void rerun()}>
              {busy ? t("run.rerunning") : t("run.rerunStage")}
            </button>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function RunSettingsSummary({ run, artifacts, compact }: { run: ProjectRunView; artifacts: ArtifactRow[]; compact?: boolean }) {
  const { t, i18n } = useTranslation("run");
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "he";
  const brief = run.brief;
  const briefOut = run.stages.find((s) => s.stage === "brief")?.output as
    | {
        renderProfile?: string;
        ttsVoiceName?: string | null;
        branding?: {
          businessName?: string;
          slogan?: string;
          logo?: { name: string; gcsPath: string; mimeType: string } | null;
        } | null;
      }
    | undefined;
  const renderOut = run.stages.find((s) => s.stage === "render")?.output as
    | { totalDurationSeconds?: number; renderProfile?: string }
    | undefined;
  const profileId =
    (typeof briefOut?.renderProfile === "string" && isRenderProfileId(briefOut.renderProfile)
      ? briefOut.renderProfile
      : null) ??
    (typeof brief.renderProfile === "string" && isRenderProfileId(brief.renderProfile)
      ? brief.renderProfile
      : null);
  const fileDurationSeconds = Number(renderOut?.totalDurationSeconds);
  const requestedDurationSeconds = Number(brief.durationSeconds) || 0;
  const showFileDuration =
    Number.isFinite(fileDurationSeconds) &&
    fileDurationSeconds > 0 &&
    Math.abs(fileDurationSeconds - requestedDurationSeconds) >= 1;
  const profile = profileId ? getRenderProfile(profileId) : null;
  const creativeLines = [
    ...formatCreativeConstraints(brief.creative, locale),
    ...(brief.creativeCatalogSnapshot ?? []).map(
      (selection) => `${selection.fieldLabel}: ${selection.optionLabel ?? String(selection.value)}`
    )
  ];
  const startedAt = run.createdAt;
  const endedAt = runEndedAt(run);
  const approvalLabel =
    brief.approvalMode === "manual"
      ? t("run.settings.approvalManual")
      : brief.approvalMode === "auto_until_render"
        ? t("run.settings.approvalBeforeRender")
        : t("run.settings.approvalAutomatic");

  const inputBranding = brief.branding ?? null;
  const outputBranding = briefOut?.branding ?? null;
  const businessName = (outputBranding?.businessName ?? inputBranding?.businessName)?.trim() || "";
  const slogan = (outputBranding?.slogan ?? inputBranding?.slogan)?.trim() || "";
  const logoGcs = outputBranding?.logo?.gcsPath ?? null;
  const logoArtifact =
    artifacts.find((a) => a.metadata?.role === "logo") ??
    (logoGcs ? artifacts.find((a) => a.gcsPath === logoGcs) : undefined);

  const language = languageLabel(run, t);
  const format =
    brief.aspectRatio === "16:9" ? t("run.settings.landscape") : brief.aspectRatio === "1:1" ? t("run.settings.square") : t("run.settings.portrait");
  const speech = brief.creative?.preferHeygenDub === "on" ? t("run.settings.lipSync") : t("run.settings.narrationOn");
  const captions = brief.creative?.karaokeCaptions === "off" ? t("run.settings.captionsOff") : t("run.settings.captionsOn");

  return (
    <section className="run-settings-summary">
      <h3>{t("run.settings.title")}</h3>
      <p className="run-settings-short">
        {language} · {format} · {t("common.seconds", { count: requestedDurationSeconds })}
        {showFileDuration ? ` · ${t("run.settings.fileDuration")} ${t("common.seconds", { count: Math.round(fileDurationSeconds) })}` : ""}
        {businessName ? ` · ${businessName}` : ""} · {speech} · {captions}
      </p>
      <details className="run-settings-more" open={!compact}>
        <summary>{t("run.productionDetails")}</summary>
        <dl className="run-settings-grid">
          <div>
            <dt>{t("run.settings.renderModel")}</dt>
            <dd>{profile ? (locale === "he" ? profile.labelHe : profile.label) : t("run.settings.systemDefault")}</dd>
          </div>
          <div>
            <dt>{t("run.settings.requestedDuration")}</dt>
            <dd>{t("common.seconds", { count: requestedDurationSeconds })}</dd>
          </div>
          {showFileDuration ? (
            <div>
              <dt>{t("run.settings.fileDuration")}</dt>
              <dd>{t("common.seconds", { count: Math.round(fileDurationSeconds) })}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t("run.settings.started")}</dt>
            <dd>{formatDateTime(startedAt)}</dd>
          </div>
          <div>
            <dt>{t("run.settings.ended")}</dt>
            <dd>{endedAt ? formatDateTime(endedAt) : run.status === "COMPLETED" ? formatDateTime(run.updatedAt) : t("run.settings.stillRunning")}</dd>
          </div>
          <div>
            <dt>{t("run.settings.creationMode")}</dt>
            <dd>{approvalLabel}</dd>
          </div>
          {briefOut?.ttsVoiceName ? (
            <div>
              <dt>{t("run.settings.ttsVoice")}</dt>
              <dd>{briefOut.ttsVoiceName}</dd>
            </div>
          ) : null}
        </dl>
        <div className="run-settings-block">
          <strong>{t("run.settings.description")}</strong>
          <p>{brief.sourceText}</p>
        </div>
        {brief.instructions?.trim() ? (
          <div className="run-settings-block">
            <strong>{t("run.settings.instructions")}</strong>
            <p>{brief.instructions}</p>
          </div>
        ) : null}
        {businessName || slogan || logoArtifact ? (
          <div className="run-settings-block run-branding-block">
            <strong>{t("run.settings.branding")}</strong>
            <div className="run-branding-row">
              {logoArtifact ? <RunLogoThumb artifactId={logoArtifact.id} /> : null}
              <div>
                {businessName ? <p className="run-branding-name">{businessName}</p> : null}
                {slogan ? <p className="muted">{slogan}</p> : null}
              </div>
            </div>
          </div>
        ) : null}
        {creativeLines.length ? (
          <div className="run-settings-block">
            <strong>{t("run.settings.advanced")}</strong>
            <ul>
              {creativeLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>
    </section>
  );
}

function RunLogoThumb({ artifactId }: { artifactId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void apiGet<{ url: string }>(`/artifacts/${artifactId}/signed-url`)
      .then((res) => {
        if (!cancelled) setUrl(res.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);
  if (!url) return <div className="run-branding-logo-placeholder" aria-hidden />;
  return <img src={url} alt="" className="run-branding-logo" />;
}

function runEndedAt(run: ProjectRunView): string | null {
  if (run.status !== "COMPLETED" && run.status !== "FAILED") return null;
  const times = run.stages
    .map((s) => s.completedAt)
    .filter((time): time is string => Boolean(time))
    .sort();
  return times[times.length - 1] ?? run.updatedAt;
}
