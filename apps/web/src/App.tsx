import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";
import { STAGE_LABELS, StageOutputView } from "./StageOutputs.js";
import { BriefQuickEditor, StageEditor, StageUploadControls } from "./StageEditor.js";
import type { ArtifactRow, GeminiCapabilityStatus, GeminiOperationRow, ProjectRunView, RunSummary, StageName } from "./types.js";
import { STAGE_ORDER, estimateRunCostUsd } from "@studio/shared";

export function App() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [run, setRun] = useState<ProjectRunView | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [capabilities, setCapabilities] = useState<GeminiCapabilityStatus | null>(null);
  const [operations, setOperations] = useState<GeminiOperationRow[]>([]);
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
    void apiGet<GeminiCapabilityStatus>("/gemini/capabilities").then(setCapabilities).catch((err) => setError((err as Error).message));
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
      </header>
      <main>
        <section className="panel runs-panel">
          <div className="panel-header">
            <h2>ריצות</h2>
            <button onClick={() => void refreshRuns()}>רענון</button>
          </div>
          <NewRunForm onCreated={(view) => { setSelectedId(view.id); void refreshRuns(); }} />
          <ul className="runs-list">
            {runs.map((r) => (
              <li key={r.id} className={r.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(r.id)}>
                <strong>{r.title}</strong>
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
              operations={operations}
              queueStats={queueStats}
              onAction={() => void refreshRun(run.id)}
            />
          )}
        </section>
      </main>
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

function NewRunForm({ onCreated }: { onCreated: (view: ProjectRunView) => void }) {
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [language, setLanguage] = useState("he");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [budgetMode, setBudgetMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const estimate = estimateRunCostUsd({ budgetMode, durationSeconds });
  async function submit() {
    if (!title.trim() || !sourceText.trim()) return;
    setBusy(true);
    try {
      const view = await apiPost<ProjectRunView>("/runs", {
        tenantSlug: "demo",
        brief: { title, sourceText, language, durationSeconds, aspectRatio: "9:16", budgetMode }
      });
      setTitle("");
      setSourceText("");
      onCreated(view);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="new-run-form">
      <input placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="brief חופשי" rows={4} value={sourceText} onChange={(e) => setSourceText(e.target.value)} />
      <select value={language} onChange={(e) => setLanguage(e.target.value)}>
        <option value="he">עברית</option>
        <option value="en">English</option>
      </select>
      <label className="budget-row">
        משך (שניות)
        <input
          type="number"
          min={5}
          max={180}
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(Number(e.target.value) || 30)}
        />
      </label>
      <label className="budget-row">
        <input type="checkbox" checked={budgetMode} onChange={(e) => setBudgetMode(e.target.checked)} />
        מצב חסכון (פחות סצנות, Veo 4s, Fast, בלי first/last frames)
      </label>
      <p className="cost-estimate">
        הערכת עלות: ~${estimate.usd.toFixed(2)} · {estimate.sceneCount} סצנות × {estimate.bucket}s Veo ({estimate.label})
      </p>
      <button disabled={busy || !title || !sourceText} onClick={() => void submit()}>
        {busy ? "..." : "צור ריצה"}
      </button>
    </div>
  );
}

function RunDetail({
  run,
  artifacts,
  capabilities,
  operations,
  queueStats,
  onAction
}: {
  run: ProjectRunView;
  artifacts: ArtifactRow[];
  capabilities: GeminiCapabilityStatus | null;
  operations: GeminiOperationRow[];
  queueStats: Array<{ queue: string; waiting: number; active: number }> | null;
  onAction: () => void;
}) {
  const scriptOutput = run.stages.find((s) => s.stage === "script")?.output as
    | { scenes?: Array<{ id: string; order: number; title: string; veoPrompt?: string; referenceImagePrompt?: string; durationBucket?: string; audioPolicy?: string }> }
    | null
    | undefined;
  return (
    <>
      <header className="run-header">
        <h2>{run.brief.title}</h2>
        <p>
          <strong>סטטוס:</strong> {run.status} · <strong>שלב:</strong> {run.currentStage ? (STAGE_LABELS[run.currentStage] ?? run.currentStage) : "—"}
        </p>
      </header>
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
                <button onClick={() => void regenerateScene(run.id, scene.id, "video", onAction)}>Regenerate video</button>
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
  const entries = [
    ["Text", capabilities.text],
    ["TTS", capabilities.tts],
    ["Image", capabilities.image],
    ["Music", capabilities.music],
    ["Veo", capabilities.video]
  ] as const;
  return (
    <section className="capabilities-panel">
      <strong>Gemini capabilities</strong>
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

function StagePanel({
  stage,
  stageLabel,
  status,
  error,
  output,
  runId,
  artifacts,
  onAction
}: {
  stage: StageName;
  stageLabel: string;
  status: string;
  error: string | null;
  output: unknown;
  runId: string;
  artifacts: ArtifactRow[];
  onAction: () => void;
}) {
  const showOutput = output && (status === "COMPLETED" || status === "AWAITING_APPROVAL" || status === "RUNNING" || status === "FAILED");
  const [busy, setBusy] = useState(false);
  async function approve() {
    setBusy(true);
    try {
      await apiPost(`/runs/${runId}/stages/${stage}/approve`);
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
      {error && <p className="error">{error}</p>}
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
        {status === "AWAITING_APPROVAL" && (
          <button className="primary" disabled={busy} onClick={() => void approve()}>
            אשר והמשך
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
