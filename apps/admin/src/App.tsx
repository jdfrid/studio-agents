import { useEffect, useState } from "react";
import { apiGet, apiPost, authLoginUrl, isQuotaErrorMessage } from "./api.js";
import { STAGE_LABELS, StageOutputView } from "./StageOutputs.js";
import { StageErrorView } from "./StageErrorView.js";
import { BriefQuickEditor, StageEditor, StageUploadControls } from "./StageEditor.js";
import { AdminDashboardPanel, AdminUsersPanel } from "./AdminPanels.js";
import { CostLedger, type CostLedgerResponse } from "./CostLedger.js";
import { CostIndicator } from "./CostIndicator.js";
import { RunsLogMatrix } from "./RunsLogMatrix.js";
import type { ArtifactRow, ProjectRunView, RunSummary, StageName } from "./types.js";
import {
  STAGE_ORDER,
  estimateRunCost,
  formatCostNis,
  getRenderProfile,
  profileToProductionCostConfig,
  statusLabelHe,
  type ProductionCostConfig,
  type RenderProfileId,
  type UserView
} from "@studio/shared";

type AppView = "runs" | "users" | "log";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [run, setRun] = useState<(ProjectRunView & { actualTotalNis?: number }) | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [costConfig, setCostConfig] = useState<ProductionCostConfig | null>(null);
  const [costLedger, setCostLedger] = useState<CostLedgerResponse | null>(null);
  const [view, setView] = useState<AppView>("runs");
  const [error, setError] = useState("");

  useEffect(() => {
    void apiGet<UserView>("/auth/me")
      .then((u) => setAuthed(u.role === "ADMIN"))
      .catch(() => setAuthed(false));
    void apiGet<{ config: ProductionCostConfig }>("/config/cost")
      .then((r) => setCostConfig(r.config))
      .catch(() => setCostConfig(null));
  }, []);

  async function refreshRuns() {
    setRuns(await apiGet<RunSummary[]>("/runs"));
  }

  async function refreshRun(id: string) {
    if (!id) return;
    setRun(await apiGet(`/runs/${id}`));
    setArtifacts(await apiGet(`/runs/${id}/artifacts`));
    try {
      setCostLedger(await apiGet(`/runs/${id}/cost-events`));
    } catch {
      setCostLedger(null);
    }
  }

  useEffect(() => {
    if (authed) void refreshRuns();
  }, [authed]);

  useEffect(() => {
    if (selectedId && authed) void refreshRun(selectedId);
    const t = window.setInterval(() => {
      if (selectedId) void refreshRun(selectedId);
    }, 5000);
    return () => window.clearInterval(t);
  }, [selectedId, authed]);

  if (authed === null) return <p className="muted">טוען…</p>;
  if (!authed) {
    return (
      <div className="admin-login">
        <h1>Prompt2Spot Admin</h1>
        <p>נדרשת הרשאת מנהל.</p>
        <a className="primary" href={authLoginUrl()}>
          התחבר עם Google
        </a>
      </div>
    );
  }

  const renderProfileId = (run?.brief as { renderProfile?: RenderProfileId })?.renderProfile ?? null;

  return (
    <div className="layout">
      <header>
        <h1>Prompt2Spot — ניהול</h1>
        <nav className="app-nav">
          <button type="button" className={view === "runs" ? "nav-active" : ""} onClick={() => setView("runs")}>
            ריצות
          </button>
          <button type="button" className={view === "users" ? "nav-active" : ""} onClick={() => setView("users")}>
            משתמשים
          </button>
          <button type="button" className={view === "log" ? "nav-active" : ""} onClick={() => setView("log")}>
            לוג עלויות
          </button>
        </nav>
      </header>
      <AdminDashboardPanel />
      {view === "log" ? (
        <RunsLogMatrix onSelectRun={(id) => { setSelectedId(id); setView("runs"); }} />
      ) : view === "users" ? (
        <AdminUsersPanel />
      ) : (
        <main className="admin-main">
          <section className="panel">
            <h2>ריצות</h2>
            <button onClick={() => void refreshRuns()}>רענון</button>
            <ul className="runs-list">
              {runs.map((r) => (
                <li key={r.id} className={r.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(r.id)}>
                  <strong>{r.title}</strong>
                  <span>{r.userEmail ?? "—"}</span>
                  <span>{statusLabelHe(r.status)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            {!run && <p className="muted">בחר ריצה</p>}
            {run && (
              <>
                <h2>{run.brief.title}</h2>
                {costConfig && renderProfileId ? (
                  <CostIndicator
                    estimate={estimateRunCost(
                      { budgetMode: true, durationSeconds: run.brief.durationSeconds ?? 30 },
                      profileToProductionCostConfig(getRenderProfile(renderProfileId), costConfig)
                    )}
                    actualCostNis={run.actualTotalNis ?? costLedger?.summary.totalNis ?? null}
                    renderProfileId={renderProfileId}
                  />
                ) : null}
                <CostLedger ledger={costLedger} renderProfileId={renderProfileId} />
                <div className="stage-grid">
                  {STAGE_ORDER.map((stage) => {
                    const s = run.stages.find((x) => x.stage === stage);
                    return (
                      <AdminStageCard
                        key={stage}
                        stage={stage}
                        run={run}
                        status={s?.status ?? "PENDING"}
                        error={s?.error ?? null}
                        output={s?.output ?? null}
                        artifacts={artifacts.filter((a) => a.stage === stage)}
                        onAction={() => void refreshRun(run.id)}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </main>
      )}
      {error ? <div className="error-banner">{error}</div> : null}
    </div>
  );
}

function AdminStageCard({
  stage,
  run,
  status,
  error,
  output,
  artifacts,
  onAction
}: {
  stage: StageName;
  run: ProjectRunView;
  status: string;
  error: string | null;
  output: unknown;
  artifacts: ArtifactRow[];
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
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
  return (
    <article className={`stage-card stage-${status.toLowerCase()}`}>
      <header>
        <strong>{STAGE_LABELS[stage]}</strong>
        <span className="stage-code">{stage}</span>
        <span className={`badge badge-${status.toLowerCase()}`}>{statusLabelHe(status)}</span>
      </header>
      {error ? (
        <div className={isQuotaErrorMessage(error) ? "error error-quota" : "error"}>
          <StageErrorView error={error} />
        </div>
      ) : null}
      {output ? (
        <>
          <StageOutputView stage={stage} output={output} artifacts={artifacts} onOpenArtifact={openArtifact} />
          {stage === "brief" ? <BriefQuickEditor runId={run.id} output={output} onSaved={onAction} /> : null}
          <StageUploadControls runId={run.id} stage={stage} output={output} onSaved={onAction} />
          <StageEditor runId={run.id} stage={stage} output={output} onSaved={onAction} />
        </>
      ) : null}
      <div className="stage-actions">
        {status === "AWAITING_APPROVAL" ? (
          <button type="button" className="primary" disabled={busy} onClick={() => void approve()}>
            אשר
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => void rerun()}>
          הרץ מחדש
        </button>
      </div>
    </article>
  );
}
