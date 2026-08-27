import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { apiGet } from "./api.js";
import {
  COST_ACTIVITY_ORDER,
  STAGE_ORDER,
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

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
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
  const { t, i18n } = useTranslation("run");
  const locale = i18n.resolvedLanguage ?? i18n.language;
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
    return <p className="muted">{t("runsLog.loading")}</p>;
  }

  if (error && !data) {
    return <p className="error-inline">{error}</p>;
  }

  const runs = data?.runs ?? [];

  return (
    <section className="runs-log-panel">
      <header className="runs-log-head">
        <div>
          <h2>{t("runsLog.title")}</h2>
          <p className="muted">
            {t("runsLog.summary", {
              count: runs.length,
              nis: formatCostNis(data?.totals.nis ?? 0),
              usd: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data?.totals.usd ?? 0)
            })}
            {" · "}
            <span className="runs-log-hint">{t("runsLog.hint")}</span>
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {t(loading ? "common.refreshing" : "common.refresh")}
        </button>
      </header>

      {runs.length === 0 ? (
        <p className="muted">{t("runsLog.empty")}</p>
      ) : (
        <div className="runs-log-table-wrap">
          <table className="runs-log-table">
            <thead>
              <tr>
                <th className="sticky-col">{t("runsLog.columns.date")}</th>
                <th className="sticky-col-2">{t("runsLog.columns.title")}</th>
                <th>{t("runsLog.columns.status")}</th>
                <th>{t("runsLog.columns.profile")}</th>
                <th title={t("runsLog.columns.totalTimeTitle")}>{t("runsLog.columns.totalTime")}</th>
                <th>{t("runsLog.columns.totalCost")}</th>
                <th className="render-highlight-head">{t("runsLog.columns.renderTime")}</th>
                <th className="render-highlight-head">{t("runsLog.columns.renderCost")}</th>
                {STAGE_ORDER.map((stage) => (
                  <th
                    key={stage}
                    className={`group-head${stage === "render" ? " render-stage-group" : ""}`}
                    title={t("runsLog.columns.stageCostTitle", { stage: t(`stages.${stage}`) })}
                  >
                    {t("runsLog.columns.stageCost", { stage: t(`stages.${stage}`) })}
                  </th>
                ))}
                {COST_ACTIVITY_ORDER.map((type) => (
                  <th key={type} className="activity-head" title={type}>
                    {activityLabel(t, type)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const render = stageCell(run, "render");
                return (
                  <tr key={run.id} className="runs-log-row" onClick={() => onSelectRun(run.id)} title={t("runsLog.openRun")}>
                    <td className="sticky-col mono">{formatDateTime(run.createdAt, locale)}</td>
                    <td className="sticky-col-2 title-cell">{run.title}</td>
                    <td>
                      <span className={`badge badge-${run.status.toLowerCase()}`}>
                        {t(`statuses.${run.status}`, { defaultValue: run.status })}
                      </span>
                    </td>
                    <td className="profile-cell">{renderProfileLabel(run.renderProfile)}</td>
                    <td className="mono" title={t("runsLog.stageTimes")}>
                      {formatDurationMs(run.totalDurationMs)}
                    </td>
                    <td className="cost-cell">{costCell(run.totalNis)}</td>
                    <td
                      className="mono render-highlight-cell"
                      title={render?.startedAt ? `${render.startedAt} → ${render.completedAt ?? "…"}` : undefined}
                    >
                      {formatDurationMs(render?.durationMs ?? null)}
                    </td>
                    <td className="cost-cell render-highlight-cell">{costCell(render?.costNis ?? 0)}</td>
                    {STAGE_ORDER.map((stageName) => {
                      const cell = stageCell(run, stageName);
                      const highlight = stageName === "render" ? " render-stage-cell" : "";
                      return (
                        <td key={`${run.id}-${stageName}-c`} className={`cost-cell${highlight}`}>
                          {costCell(cell?.costNis ?? 0)}
                        </td>
                      );
                    })}
                    {COST_ACTIVITY_ORDER.map((type) => (
                      <td key={`${run.id}-${type}`} className="cost-cell">
                        {costCell(activityCost(run, type))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function activityLabel(t: TFunction<"run">, type: CostActivityType): string {
  const provider = type === "veo_video" ? "Veo" : "";
  return t(`costs.activities.${type}`, { provider });
}
