import { useEffect, useState } from "react";
import { apiGet } from "./api.js";
import { STAGE_LABELS } from "./StageOutputs.js";
import {
  COST_ACTIVITY_ORDER,
  STAGE_ORDER,
  activityTypeLabel,
  formatCostNis,
  formatDurationMs,
  getRenderProfile,
  type CostActivityType,
  type RenderProfileId,
  type RunLogMatrixResponse,
  type RunLogEntry
} from "@studio/shared";

function renderProfileLabel(id: string | null): string {
  if (!id) return "—";
  try {
    return getRenderProfile(id as RenderProfileId).label;
  } catch {
    return id;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function costCell(nis: number): string {
  if (nis <= 0) return "—";
  return formatCostNis(nis);
}

function activityCost(entry: RunLogEntry, type: CostActivityType): number {
  return entry.costsByActivity[type]?.nis ?? 0;
}

function stageCell(run: RunLogEntry, stageName: (typeof STAGE_ORDER)[number]) {
  return run.stages.find((s) => s.stage === stageName);
}

export function RunsLogMatrix({ onSelectRun }: { onSelectRun: (runId: string) => void }) {
  const [data, setData] = useState<RunLogMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      setData(await apiGet<RunLogMatrixResponse>("/runs/log-matrix"));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(interval);
  }, []);

  if (loading && !data) {
    return <p className="muted">טוען לוג ריצות…</p>;
  }

  if (error && !data) {
    return <p className="error-inline">{error}</p>;
  }

  const runs = data?.runs ?? [];

  return (
    <section className="runs-log-panel">
      <header className="runs-log-head">
        <div>
          <h2>לוג ריצות ועלויות</h2>
          <p className="muted">
            {runs.length} ריצות · סה״כ {formatCostNis(data?.totals.nis ?? 0)} · ${(data?.totals.usd ?? 0).toFixed(2)}
            {" · "}
            <span className="runs-log-hint">גלול ימינה לפירוט כל השלבים · עמודות רינדור מודגשות</span>
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? "מרענן…" : "רענון"}
        </button>
      </header>

      {runs.length === 0 ? (
        <p className="muted">אין ריצות עדיין.</p>
      ) : (
        <div className="runs-log-table-wrap">
          <table className="runs-log-table">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky-col">תאריך</th>
                <th rowSpan={2} className="sticky-col-2">כותרת</th>
                <th rowSpan={2}>סטטוס</th>
                <th rowSpan={2}>פרופיל</th>
                <th rowSpan={2}>סה״כ זמן</th>
                <th rowSpan={2}>סה״כ ₪</th>
                <th rowSpan={2} className="render-highlight-head">רינדור · זמן</th>
                <th rowSpan={2} className="render-highlight-head">רינדור · ₪</th>
                {STAGE_ORDER.map((stage) => (
                  <th key={stage} colSpan={2} className={`group-head${stage === "render" ? " render-stage-group" : ""}`}>
                    {STAGE_LABELS[stage]}
                  </th>
                ))}
                {COST_ACTIVITY_ORDER.map((type) => (
                  <th key={type} rowSpan={2} className="activity-head" title={type}>
                    {activityTypeLabel(type)}
                  </th>
                ))}
              </tr>
              <tr>
                {STAGE_ORDER.flatMap((stage) => [
                  <th key={`${stage}-time`} className="subhead">
                    זמן
                  </th>,
                  <th key={`${stage}-cost`} className="subhead">
                    ₪
                  </th>
                ])}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="runs-log-row" onClick={() => onSelectRun(run.id)} title="לחץ לפתיחת הריצה">
                  <td className="sticky-col mono">{formatDateTime(run.createdAt)}</td>
                  <td className="sticky-col-2 title-cell">{run.title}</td>
                  <td>
                    <span className={`badge badge-${run.status.toLowerCase()}`}>{run.status}</span>
                  </td>
                  <td className="profile-cell">{renderProfileLabel(run.renderProfile)}</td>
                  <td className="mono">{formatDurationMs(run.totalDurationMs)}</td>
                  <td className="cost-cell">{costCell(run.totalNis)}</td>
                  {(() => {
                    const render = stageCell(run, "render");
                    return (
                      <>
                        <td
                          className="mono render-highlight-cell"
                          title={render?.startedAt ? `${render.startedAt} → ${render.completedAt ?? "…"}` : undefined}
                        >
                          {formatDurationMs(render?.durationMs ?? null)}
                        </td>
                        <td className="cost-cell render-highlight-cell">{costCell(render?.costNis ?? 0)}</td>
                      </>
                    );
                  })()}
                  {STAGE_ORDER.flatMap((stageName) => {
                    const cell = stageCell(run, stageName);
                    const highlight = stageName === "render" ? " render-stage-cell" : "";
                    return [
                      <td
                        key={`${run.id}-${stageName}-t`}
                        className={`mono stage-time${highlight}`}
                        title={cell?.startedAt ? `${cell.startedAt} → ${cell.completedAt ?? "…"}` : undefined}
                      >
                        {formatDurationMs(cell?.durationMs ?? null)}
                      </td>,
                      <td key={`${run.id}-${stageName}-c`} className={`cost-cell${highlight}`}>
                        {costCell(cell?.costNis ?? 0)}
                      </td>
                    ];
                  })}
                  {COST_ACTIVITY_ORDER.map((type) => (
                    <td key={`${run.id}-${type}`} className="cost-cell">
                      {costCell(activityCost(run, type))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
