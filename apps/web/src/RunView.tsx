import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";
import { STAGE_LABELS, StageOutputView } from "./StageOutputs.js";
import { VisualCorrectionsPanel } from "./VisualCorrectionsPanel.js";
import { StageErrorView } from "./StageErrorView.js";
import { StageEditor, StageUploadControls } from "./StageEditor.js";
import { STAGE_ORDER, statusLabelHe } from "@studio/shared";
import type { ArtifactRow, ProjectRunView, StageName } from "./types.js";

export function RunView({ runId, onBack }: { runId: string; onBack: () => void }) {
  const [run, setRun] = useState<ProjectRunView | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setRun(await apiGet<ProjectRunView>(`/runs/${runId}`));
      setArtifacts(await apiGet<ArtifactRow[]>(`/runs/${runId}/artifacts`));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(t);
  }, [runId]);

  if (!run) return <p className="muted">{error || "טוען…"}</p>;

  const scriptOutput = run.stages.find((s) => s.stage === "script")?.output as
    | { characterBible?: string; visualCorrections?: string; scenes?: Array<{ id: string; order: number; title: string }> }
    | undefined;

  return (
    <div className="run-view">
      <header className="run-view-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← חזרה
        </button>
        <h2>{run.brief.title}</h2>
        <span className={`status-pill status-${run.status.toLowerCase()}`}>{statusLabelHe(run.status)}</span>
      </header>

      <ol className="progress-timeline progress-timeline-stack">
        {STAGE_ORDER.map((stage) => {
          const s = run.stages.find((x) => x.stage === stage);
          const st = s?.status ?? "PENDING";
          return (
            <li key={stage} className={`timeline-step step-${st.toLowerCase()}`}>
              <span className="step-dot" />
              <span className="step-label">{STAGE_LABELS[stage]}</span>
              <span className="step-status">{statusLabelHe(st)}</span>
            </li>
          );
        })}
      </ol>

      {scriptOutput?.scenes?.length ? (
        <VisualCorrectionsPanel runId={runId} scriptOutput={scriptOutput} runStatus={run.status} onSaved={() => void refresh()} />
      ) : null}

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

  async function openArtifact(id: string) {
    const { url } = await apiGet<{ url: string }>(`/artifacts/${id}/signed-url`);
    window.open(url, "_blank");
  }

  const showOutput = s?.output && status !== "PENDING";
  const hasBody = Boolean(s?.error || showOutput || status === "AWAITING_APPROVAL");

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
        <strong>{STAGE_LABELS[stage]}</strong>
        <span className={`badge badge-${status.toLowerCase()}`}>{statusLabelHe(status)}</span>
      </summary>
      <div className="stage-collapse-body">
        {!hasBody ? <p className="muted">אין תוכן להצגה בשלב זה עדיין.</p> : null}
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
              {busy ? "…" : "אשר והמשך"}
            </button>
          ) : null}
        </div>
      </div>
    </details>
  );
}
