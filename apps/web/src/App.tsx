import { useEffect, useState } from "react";
import { apiGet, apiPost, formatApiErrorMessage, isQuotaErrorMessage } from "./api.js";
import { STAGE_LABELS, StageOutputView } from "./StageOutputs.js";
import { StageErrorView } from "./StageErrorView.js";
import { BriefQuickEditor, StageEditor, StageUploadControls } from "./StageEditor.js";
import type { ArtifactRow, GeminiCapabilityStatus, GeminiOperationRow, ProjectRunView, RunSummary, StageName } from "./types.js";
import { STAGE_ORDER, estimateRunCost, formatCostNis, getRenderProfile, profileToProductionCostConfig, type ProductionCostConfig, type RenderProfileId, type RunCostEstimate } from "@studio/shared";
import { CostConfirmCheckbox, CostIndicator } from "./CostIndicator.js";
import { CostLedger, type CostLedgerResponse } from "./CostLedger.js";

export function App() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [run, setRun] = useState<ProjectRunView | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [capabilities, setCapabilities] = useState<GeminiCapabilityStatus | null>(null);
  const [costConfig, setCostConfig] = useState<ProductionCostConfig | null>(null);
  const [renderProfiles, setRenderProfiles] = useState<Array<{ id: RenderProfileId; label: string }>>([]);
  const [defaultRenderProfileId, setDefaultRenderProfileId] = useState<RenderProfileId>("veo-multiclip");
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [operations, setOperations] = useState<GeminiOperationRow[]>([]);
  const [costLedger, setCostLedger] = useState<CostLedgerResponse | null>(null);
  const [queueStats, setQueueStats] = useState<Array<{ queue: string; waiting: number; active: number }> | null>(null);
  const [error, setError] = useState<string>("");

  async function refreshRuns() {
    try {
      const list = await apiGet<RunSummary[]>("/runs");
      setRuns(list);
      if (!selectedId && list[0]) setSelectedId(list[0].id);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function refreshRun(id: string) {
    if (!id) return;
    try {
      const r = await apiGet<ProjectRunView>(`/runs/${id}`);
      setRun(r);
      const a = await apiGet<ArtifactRow[]>(`/runs/${id}/artifacts`);
      setArtifacts(a);
      setOperations(await apiGet<GeminiOperationRow[]>(`/runs/${id}/gemini-operations`));
      try {
        setCostLedger(await apiGet<CostLedgerResponse>(`/runs/${id}/cost-events`));
      } catch {
        setCostLedger(null);
      }
      try {
        const q = await apiGet<{ queues: Array<{ queue: string; waiting: number; active: number }> }>("/health/queues");
        setQueueStats(q.queues);
      } catch {
        setQueueStats(null);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }
  useEffect(() => {
    void refreshRuns();
    void apiGet<{ ok: boolean }>("/health")
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));
    void apiGet<GeminiCapabilityStatus>("/gemini/capabilities").then(setCapabilities).catch((err) => {
      setApiOnline(false);
      setError((err as Error).message);
    });
    void apiGet<{ config: ProductionCostConfig }>("/config/cost").then((r) => setCostConfig(r.config)).catch(() => setCostConfig(null));
    void apiGet<{ defaultProfileId: RenderProfileId; profiles: Array<{ id: RenderProfileId; label: string }> }>("/config/render-profiles")
      .then((r) => {
        setRenderProfiles(r.profiles.map((p) => ({ id: p.id, label: p.label })));
        setDefaultRenderProfileId(r.defaultProfileId);
      })
      .catch(() => setRenderProfiles([]));
  }, []);
  useEffect(() => {
    if (selectedId) void refreshRun(selectedId);
    const interval = window.setInterval(() => {
      if (selectedId) void refreshRun(selectedId);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedId]);

  return (
    <div className="layout">
      <header>
        <h1>Studio Agents</h1>
        <small>7-stage video production pipeline</small>
        {apiOnline === false ? (
          <span className="api-offline-badge">API לא זמין — בדוק שה-containers רצים</span>
        ) : apiOnline === true ? (
          <span className="api-online-badge">API מחובר</span>
        ) : null}
      </header>
      <main>
        <section className="panel runs-panel">
          <div className="panel-header">
            <h2>ריצות</h2>
            <button onClick={() => void refreshRuns()}>רענון</button>
          </div>
          <NewRunForm
            apiOnline={apiOnline}
            costConfig={costConfig}
            capabilities={capabilities}
            renderProfiles={renderProfiles}
            defaultRenderProfileId={defaultRenderProfileId}
            onError={setError}
            onCreated={(view) => { setSelectedId(view.id); void refreshRuns(); }}
          />
          <ul className="runs-list">
            {runs.map((r) => (
              <li key={r.id} className={r.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(r.id)}>
                <strong>{r.title}</strong>
                {r.renderProfile ? <span className="render-profile-badge">{renderProfileLabel(r.renderProfile)}</span> : null}
                <span>{r.status} · {r.currentStage ?? "—"}</span>
                <small>{new Date(r.updatedAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel run-detail-panel">
          {!run && <p className="muted">בחר או צור ריצה חדשה.</p>}
          {run && (
            <RunDetail
              run={run}
              artifacts={artifacts}
              capabilities={capabilities}
              costConfig={costConfig}
              operations={operations}
              costLedger={costLedger}
              queueStats={queueStats}
              onAction={() => void refreshRun(run.id)}
            />
          )}
        </section>
      </main>
      {error ? (
        <div className={`error-banner${isQuotaErrorMessage(error) ? " error-banner-quota" : ""}`}>
          <StageErrorView error={error} />
        </div>
      ) : null}
    </div>
  );
}

function renderProfileLabel(id: string): string {
  try {
    return getRenderProfile(id as RenderProfileId).label;
  } catch {
    return id;
  }
}

function NewRunForm({
  onCreated,
  onError,
  costConfig,
  capabilities,
  renderProfiles,
  defaultRenderProfileId,
  apiOnline
}: {
  onCreated: (view: ProjectRunView) => void;
  onError: (message: string) => void;
  costConfig: ProductionCostConfig | null;
  capabilities: GeminiCapabilityStatus | null;
  renderProfiles: Array<{ id: RenderProfileId; label: string }>;
  defaultRenderProfileId: RenderProfileId;
  apiOnline: boolean | null;
}) {
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [language, setLanguage] = useState("he");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [budgetMode, setBudgetMode] = useState(true);
  const [renderProfileId, setRenderProfileId] = useState<RenderProfileId>(defaultRenderProfileId);
  const [costConfirmed, setCostConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRenderProfileId(defaultRenderProfileId);
  }, [defaultRenderProfileId]);
  const baseConfig: Partial<ProductionCostConfig> = costConfig ?? (capabilities?.video.model ? { videoModel: capabilities.video.model, veoGenerateAudio: true, usdToIls: 3.6 } : {});
  const estimate = estimateRunCost(
    { budgetMode, durationSeconds },
    profileToProductionCostConfig(getRenderProfile(renderProfileId), baseConfig)
  );
  const estimateFromServer = apiOnline === true && Boolean(costConfig ?? capabilities?.video.model);
  const canSubmit = Boolean(title.trim() && sourceText.trim() && apiOnline === true && (!estimate.isExpensive || costConfirmed));
  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const view = await apiPost<ProjectRunView>("/runs", {
        tenantSlug: "demo",
        brief: { title, sourceText, language, durationSeconds, aspectRatio: "9:16", budgetMode, renderProfile: renderProfileId }
      });
      setTitle("");
      setSourceText("");
      setCostConfirmed(false);
      onCreated(view);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="new-run-form">
      {apiOnline === false ? (
        <p className="cost-indicator-warning">ה-API לא מגיב (500). הרץ בשרת: docker compose -f infra/hetzner/docker-compose.yml ps && docker compose logs api --tail 40</p>
      ) : null}
      {!estimateFromServer ? (
        <p className="cost-indicator-warning">הערכת עלות זו היא ברירת מחדל — לא מהשרver. אחרי תיקון ה-API תראה את המודל האמיתי.</p>
      ) : null}
      <CostIndicator estimate={estimate} briefDurationSeconds={durationSeconds} />
      <input placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="brief חופשי" rows={4} value={sourceText} onChange={(e) => setSourceText(e.target.value)} />
      <select value={language} onChange={(e) => setLanguage(e.target.value)}>
        <option value="he">עברית</option>
        <option value="en">English</option>
      </select>
      <label className="budget-row">
        פרופיל רינדור
        <select
          value={renderProfileId}
          onChange={(e) => {
            setRenderProfileId(e.target.value as RenderProfileId);
            setCostConfirmed(false);
          }}
        >
          {(renderProfiles.length ? renderProfiles : [
            { id: "veo-multiclip" as RenderProfileId, label: "Veo Fast — multiclip" },
            { id: "veo-extend" as RenderProfileId, label: "Veo Fast — extend chain" },
            { id: "kling-i2v" as RenderProfileId, label: "Kling 2.1 — image-to-video" }
          ]).map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <label className="budget-row">
        משך (שניות)
        <input
          type="number"
          min={5}
          max={180}
          value={durationSeconds}
          onChange={(e) => {
            setDurationSeconds(Number(e.target.value) || 30);
            setCostConfirmed(false);
          }}
        />
      </label>
      <label className="budget-row">
        <input
          type="checkbox"
          checked={budgetMode}
          onChange={(e) => {
            setBudgetMode(e.target.checked);
            setCostConfirmed(false);
          }}
        />
        מצב חסכון (פחות סצנות, Veo 4s, בלי first/last frames)
      </label>
      <CostConfirmCheckbox checked={costConfirmed} onChange={setCostConfirmed} estimate={estimate} />
      <button className={estimate.isExpensive ? "danger" : "primary"} disabled={busy || !canSubmit} onClick={() => void submit()}>
        {busy ? "..." : estimate.isExpensive ? `צור ריצה (${formatCostNis(estimate.nis)})` : "צור ריצה"}
      </button>
    </div>
  );
}

function RunDetail({
  run,
  artifacts,
  capabilities,
  costConfig,
  operations,
  costLedger,
  queueStats,
  onAction
}: {
  run: ProjectRunView;
  artifacts: ArtifactRow[];
  capabilities: GeminiCapabilityStatus | null;
  costConfig: ProductionCostConfig | null;
  operations: GeminiOperationRow[];
  costLedger: CostLedgerResponse | null;
  queueStats: Array<{ queue: string; waiting: number; active: number }> | null;
  onAction: () => void;
}) {
  const scriptOutput = run.stages.find((s) => s.stage === "script")?.output as
    | { scenes?: Array<{ id: string; order: number; title: string; veoPrompt?: string; referenceImagePrompt?: string; durationBucket?: string; audioPolicy?: string }> }
    | null
    | undefined;
  const budgetMode = run.brief.budgetMode ?? false;
  const renderProfileId = (run.brief as { renderProfile?: RenderProfileId }).renderProfile ?? null;
  const config: Partial<ProductionCostConfig> =
    costConfig ?? (capabilities?.video.model ? { videoModel: capabilities.video.model, veoGenerateAudio: true, usdToIls: 3.6 } : {});
  const runEstimate = estimateRunCost(
    {
      budgetMode,
      durationSeconds: run.brief.durationSeconds ?? 30,
      scenes: scriptOutput?.scenes ?? null
    },
    renderProfileId ? profileToProductionCostConfig(getRenderProfile(renderProfileId), config) : config
  );
  const renderPending = run.stages.some((s) => s.stage === "render" && (s.status === "PENDING" || s.status === "QUEUED" || s.status === "RUNNING"));
  return (
    <>
      <header className="run-header">
        <h2>{run.brief.title}</h2>
        {renderProfileId ? <span className="render-profile-badge">{renderProfileLabel(renderProfileId)}</span> : null}
        <p>
          <strong>סטטוס:</strong> {run.status} · <strong>שלב:</strong> {run.currentStage ? (STAGE_LABELS[run.currentStage] ?? run.currentStage) : "—"}
        </p>
      </header>
      <CostIndicator
        estimate={runEstimate}
        compact={!renderPending && run.status === "COMPLETED"}
        briefDurationSeconds={run.brief.durationSeconds ?? 30}
        actualCostNis={costLedger?.summary.totalNis ?? null}
        ledgerSummary={costLedger?.summary ?? null}
      />
      <CostLedger ledger={costLedger} />
      <GeminiCapabilitiesPanel capabilities={capabilities} />
      {run.stages.some((s) => s.status === "QUEUED") && queueStats ? (
        <section className="queue-panel">
          <strong>תור Redis (worker)</strong>
          <p className="muted">
            אם <code>agent-brief</code> מראה waiting &gt; 0 והשלב לא זז — ה-worker לא רץ או לא עודכן. הרץ בשרת:{" "}
            <code>docker compose -f infra/hetzner/docker-compose.yml up -d --build --force-recreate worker api</code>
          </p>
          <ul className="queue-list">
            {queueStats.map((q) => (
              <li key={q.queue}>
                <code>{q.queue}</code> · waiting: {q.waiting} · active: {q.active}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {scriptOutput?.scenes?.length ? (
        <section className="scene-grid">
          {scriptOutput.scenes.map((scene) => (
            <article className="scene-card" key={scene.id}>
              <strong>
                Scene {scene.order + 1}: {scene.title}
              </strong>
              <p><b>Veo:</b> {scene.veoPrompt ?? "(missing)"}</p>
              <p><b>Reference:</b> {scene.referenceImagePrompt ?? "(none)"}</p>
              <small>
                duration: {scene.durationBucket ?? "?"}s · audio: {scene.audioPolicy ?? "?"}
              </small>
              <div className="stage-actions">
                <button onClick={() => void regenerateScene(run.id, scene.id, "visual", onAction)}>Regenerate visual</button>
                <button
                  title={`עלות משוערת: ${formatCostNis(estimateSceneVeoCost(scene, config).nis)}`}
                  onClick={() => {
                    const cost = estimateSceneVeoCost(scene, config);
                    if (cost.isExpensive && !window.confirm(`Regenerate video עלול לעלות ${formatCostNis(cost.nis)}. להמשיך?`)) return;
                    void regenerateScene(run.id, scene.id, "video", onAction);
                  }}
                >
                  Regenerate video ({formatCostNis(estimateSceneVeoCost(scene, config).nis)})
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {operations.length > 0 && (
        <details className="operations-panel" open>
          <summary>Gemini / Veo operations</summary>
          <ul>
            {operations.map((op) => (
              <li key={op.id}>
                <code>{String(op.metadata.operationName ?? op.id)}</code> · {op.stage} · {new Date(op.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="stage-grid stage-grid-full">
        {STAGE_ORDER.map((stage) => {
          const s = run.stages.find((x) => x.stage === stage);
          return (
            <StagePanel
              key={stage}
              stage={stage}
              stageLabel={STAGE_LABELS[stage]}
              status={s?.status ?? "PENDING"}
              error={s?.error ?? null}
              output={s?.output ?? null}
              runId={run.id}
              artifacts={artifacts.filter((a) => a.stage === stage)}
              brief={run.brief}
              scriptScenes={scriptOutput?.scenes ?? null}
              costConfig={costConfig}
              capabilities={capabilities}
              onAction={onAction}
            />
          );
        })}
      </div>
    </>
  );
}

function GeminiCapabilitiesPanel({ capabilities }: { capabilities: GeminiCapabilityStatus | null }) {
  if (!capabilities) return null;
  const videoTier = capabilities.video.model.includes("lite")
    ? "lite"
    : capabilities.video.model.includes("fast")
      ? "fast"
      : capabilities.video.model.includes("generate-preview")
        ? "standard"
        : "unknown";
  const entries = [
    ["Text", capabilities.text],
    ["TTS", capabilities.tts],
    ["Image", capabilities.image],
    ["Music", capabilities.music],
    ["Veo", capabilities.video]
  ] as const;
  return (
    <section className={`capabilities-panel${videoTier === "standard" ? " capabilities-danger" : ""}`}>
      <strong>Gemini capabilities</strong>
      {videoTier === "standard" ? (
        <p className="cost-indicator-warning">
          אזהרה: השרת משתמש ב-Veo Standard — ~₪1.4 לכל שניית וידאו. שנה ל-fast ב-.env
        </p>
      ) : videoTier === "lite" ? (
        <p className="cost-indicator-warning">
          אזהרה: Veo Lite לא תומך ב-reference images — המערכת תfallback ל-Fast. מומלץ לשנות ל-veo-3.1-fast-generate-preview ב-.env
        </p>
      ) : null}
      <div className="capability-list">
        {entries.map(([label, item]) => (
          <span key={label} className={item.available ? "capability-ok" : "capability-missing"}>
            {label}: {item.model} {item.available ? "available" : `unavailable (${item.reason ?? "unknown"})`}
          </span>
        ))}
      </div>
    </section>
  );
}

async function regenerateScene(runId: string, sceneId: string, kind: "visual" | "video", onDone: () => void) {
  await apiPost(`/runs/${runId}/scenes/${sceneId}/regenerate-${kind}`);
  onDone();
}

function estimateSceneVeoCost(
  scene: { durationBucket?: string },
  config: Partial<ProductionCostConfig>
): RunCostEstimate {
  return estimateRunCost({ budgetMode: true, durationSeconds: 4, scenes: [{ durationBucket: scene.durationBucket ?? "4" }] }, config);
}

function StagePanel({
  stage,
  stageLabel,
  status,
  error,
  output,
  runId,
  artifacts,
  brief,
  scriptScenes,
  costConfig,
  capabilities,
  onAction
}: {
  stage: StageName;
  stageLabel: string;
  status: string;
  error: string | null;
  output: unknown;
  runId: string;
  artifacts: ArtifactRow[];
  brief: ProjectRunView["brief"];
  scriptScenes: Array<{ durationBucket?: string }> | null;
  costConfig: ProductionCostConfig | null;
  capabilities: GeminiCapabilityStatus | null;
  onAction: () => void;
}) {
  const showOutput = output && (status === "COMPLETED" || status === "AWAITING_APPROVAL" || status === "RUNNING" || status === "FAILED");
  const [busy, setBusy] = useState(false);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const config: Partial<ProductionCostConfig> =
    costConfig ?? (capabilities?.video.model ? { videoModel: capabilities.video.model, veoGenerateAudio: true, usdToIls: 3.6 } : {});
  const renderCost =
    stage === "package" && status === "AWAITING_APPROVAL"
      ? estimateRunCost(
          { budgetMode: brief.budgetMode ?? false, durationSeconds: brief.durationSeconds ?? 30, scenes: scriptScenes },
          config
        )
      : null;
  async function approve() {
    if (renderCost?.isExpensive && !approveConfirmed) return;
    setBusy(true);
    try {
      await apiPost(`/runs/${runId}/stages/${stage}/approve`);
      setApproveConfirmed(false);
      onAction();
    } finally {
      setBusy(false);
    }
  }
  async function rerun() {
    setBusy(true);
    try {
      await apiPost(`/runs/${runId}/stages/${stage}/rerun`);
      onAction();
    } finally {
      setBusy(false);
    }
  }
  async function openArtifact(artifactId: string) {
    const { url } = await apiGet<{ url: string }>(`/artifacts/${artifactId}/signed-url`);
    window.open(url, "_blank");
  }
  return (
    <article className={`stage-card stage-${status.toLowerCase()}`}>
      <header>
        <strong>{stageLabel}</strong>
        <span className="stage-code">{stage}</span>
        <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
      </header>
      {status === "QUEUED" && <p className="muted">ממתין ל-worker…</p>}
      {error ? (
        <div className={isQuotaErrorMessage(error) ? "error error-quota" : "error"}>
          <StageErrorView error={error} />
        </div>
      ) : null}
      {showOutput ? (
        <>
          <StageOutputView stage={stage} output={output} artifacts={artifacts} onOpenArtifact={openArtifact} />
          {stage === "brief" ? <BriefQuickEditor runId={runId} output={output} onSaved={onAction} /> : null}
          <StageUploadControls runId={runId} stage={stage} output={output} onSaved={onAction} />
          <StageEditor runId={runId} stage={stage} output={output} onSaved={onAction} />
        </>
      ) : status === "PENDING" ? (
        <p className="muted">טרם התחיל</p>
      ) : null}
      {artifacts.length > 0 && (
        <ul className="artifacts">
          {artifacts.map((a) => (
            <li key={a.id}>
              <button onClick={() => void openArtifact(a.id)}>{a.kind}</button>
              <small>{a.mimeType} · {formatBytes(a.sizeBytes)}</small>
            </li>
          ))}
        </ul>
      )}
      {output != null && (
        <details>
          <summary>JSON גולמי</summary>
          <pre>{JSON.stringify(output, null, 2)}</pre>
        </details>
      )}
      <div className="stage-actions">
        {renderCost ? (
          <>
            <CostIndicator estimate={renderCost} compact showBreakdown={false} />
            {renderCost.isExpensive ? (
              <CostConfirmCheckbox checked={approveConfirmed} onChange={setApproveConfirmed} estimate={renderCost} />
            ) : null}
          </>
        ) : null}
        {status === "AWAITING_APPROVAL" && (
          <button
            className={renderCost?.isExpensive ? "danger" : "primary"}
            disabled={busy || Boolean(renderCost?.isExpensive && !approveConfirmed)}
            onClick={() => void approve()}
          >
            {renderCost ? `אשר והמשך ל-Veo (${formatCostNis(renderCost.nis)})` : "אשר והמשך"}
          </button>
        )}
        {(status === "COMPLETED" || status === "FAILED" || status === "AWAITING_APPROVAL" || status === "QUEUED") && (
          <button disabled={busy} onClick={() => void rerun()}>
            {status === "QUEUED" ? "שלח שוב ל-worker" : "הרץ מחדש"}
          </button>
        )}
      </div>
    </article>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
