import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiDelete, apiGet, apiPost } from "./api.js";
import { StageOutputView } from "./StageOutputs.js";
import { StageProgressClock } from "./StageProgressClock.js";
import { VisualCorrectionsPanel } from "./VisualCorrectionsPanel.js";
import { StageErrorView } from "./StageErrorView.js";
import { StageEditor, StageUploadControls } from "./StageEditor.js";
import {
  STAGE_ORDER,
  formatCreativeConstraints,
  getRenderProfile,
  isRenderProfileId
} from "@studio/shared";
import type { ArtifactRow, ProjectRunView, StageName } from "./types.js";
import { formatDateTime } from "./i18n/format.js";

export function RunView({ runId, onBack }: { runId: string; onBack: () => void }) {
  const { t, i18n } = useTranslation("run");
  const [run, setRun] = useState<ProjectRunView | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    try {
      setRun(await apiGet<ProjectRunView>(`/runs/${runId}`));
      setArtifacts(await apiGet<ArtifactRow[]>(`/runs/${runId}/artifacts`));
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
    const t = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(t);
  }, [runId]);

  if (!run) return <p className="muted">{error || t("common.loading")}</p>;

  const scriptOutput = run.stages.find((s) => s.stage === "script")?.output as
    | { characterBible?: string; visualCorrections?: string; scenes?: Array<{ id: string; order: number; title: string }> }
    | undefined;

  return (
    <div className="run-view">
      <StageProgressClock run={run} />
      <header className="run-view-header">
        <button type="button" className="button-secondary back-button" onClick={onBack}>
          <span aria-hidden>{i18n.dir() === "rtl" ? "→" : "←"}</span>
          {t("run.back")}
        </button>
        <div className="run-title-block">
          <p className="eyebrow">{t("run.projectEyebrow")}</p>
          <div>
            <h1>{run.brief.title}</h1>
            <span className={`status-pill status-${run.status.toLowerCase()}`}>{t(`statuses.${run.status}`, { defaultValue: run.status })}</span>
          </div>
        </div>
        <div className="run-header-actions">
          <button type="button" className="link-btn run-delete-btn" disabled={deleting} onClick={() => void deleteThisRun()}>
            {deleting ? t("run.deleting") : run.status !== "COMPLETED" ? t("run.deleteProcess") : t("run.delete")}
          </button>
        </div>
      </header>

      <RunSettingsSummary run={run} artifacts={artifacts} />

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

      {scriptOutput?.scenes?.length ? (
        <VisualCorrectionsPanel runId={runId} scriptOutput={scriptOutput} runStatus={run.status} onSaved={() => void refresh()} />
      ) : null}

      <AlignDubbingPanel run={run} onDone={() => void refresh()} />

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
    </div>
  );
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

function RunSettingsSummary({ run, artifacts }: { run: ProjectRunView; artifacts: ArtifactRow[] }) {
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
  const profileId =
    (typeof brief.renderProfile === "string" && isRenderProfileId(brief.renderProfile)
      ? brief.renderProfile
      : null) ??
    (typeof briefOut?.renderProfile === "string" && isRenderProfileId(briefOut.renderProfile)
      ? briefOut.renderProfile
      : null);
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

  const attachmentLines = (brief.attachments ?? []).map((att) => {
    const roleKey =
      att.role === "voice_clone"
        ? "voice_clone"
        : att.role === "insert_clip"
          ? "insert_clip"
          : att.role === "reference_video"
            ? "reference_video"
            : att.role === "product"
              ? "product"
              : att.role === "logo"
                ? "logo"
                : "character";
    const role = t(`run.settings.attachmentRoles.${roleKey}`, {
      time:
        roleKey === "insert_clip" && att.insertAtSeconds != null
          ? t("run.settings.insertedAt", { seconds: att.insertAtSeconds })
          : ""
    });
    return `${role}: ${att.name}`;
  });

  return (
    <section className="run-settings-summary">
      <h3>{t("run.settings.title")}</h3>
      <dl className="run-settings-grid">
        <div>
          <dt>{t("run.settings.renderModel")}</dt>
          <dd>{profile ? (locale === "he" ? profile.labelHe : profile.label) : t("run.settings.systemDefault")}</dd>
        </div>
        <div>
          <dt>{t("run.settings.started")}</dt>
          <dd>{formatDateTime(startedAt)}</dd>
        </div>
        <div>
          <dt>{t("run.settings.ended")}</dt>
          <dd>{endedAt ? formatDateTime(endedAt) : run.status === "COMPLETED" ? formatDateTime(run.updatedAt) : t("run.settings.stillRunning")}</dd>
        </div>
        <div>
          <dt>{t("run.settings.requestedDuration")}</dt>
          <dd>{t("common.seconds", { count: brief.durationSeconds })}</dd>
        </div>
        <div>
          <dt>{t("run.settings.aspectRatio")}</dt>
          <dd>
            {brief.aspectRatio === "16:9" ? t("run.settings.landscape") : brief.aspectRatio === "1:1" ? t("run.settings.square") : t("run.settings.portrait")}
          </dd>
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
      {attachmentLines.length ? (
        <div className="run-settings-block">
          <strong>{t("run.settings.attachments")}</strong>
          <ul>
            {attachmentLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
    .filter((t): t is string => Boolean(t))
    .sort();
  return times[times.length - 1] ?? run.updatedAt;
}
