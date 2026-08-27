import type { RunCostEstimate, CostEventSummary, CostActivityType, RenderProfileId } from "@studio/shared";
import { activityTypeLabel, formatCostNis, videoSecondsUnitLabel } from "@studio/shared";
import { useTranslation } from "react-i18next";

function ledgerBreakdownRows(summary: CostEventSummary, locale: "he" | "en", renderProfileId?: RenderProfileId | null): Array<{ label: string; nis: number; usd: number; count: number }> {
  const order: CostActivityType[] = [
    "veo_video",
    "gemini_image",
    "gemini_tts",
    "gemini_text",
    "gemini_music",
    "gcs_upload",
    "gcs_storage"
  ];
  return order
    .map((type) => {
      const row = summary.byActivity[type];
      if (!row || row.count === 0) return null;
      return { label: activityTypeLabel(type, renderProfileId, locale), nis: row.nis, usd: row.usd, count: row.count };
    })
    .filter((row): row is { label: string; nis: number; usd: number; count: number } => row != null);
}

export function CostIndicator({
  estimate,
  compact = false,
  showBreakdown = true,
  briefDurationSeconds,
  actualCostNis,
  ledgerSummary,
  renderProfileId
}: {
  estimate: RunCostEstimate;
  compact?: boolean;
  showBreakdown?: boolean;
  /** Brief target length — when different from veoSeconds, show both. */
  briefDurationSeconds?: number;
  /** Sum from Cost Ledger after run (usageMetadata-based when available). */
  actualCostNis?: number | null;
  /** Actual breakdown from Cost Ledger — shown instead of pre-run estimate when available. */
  ledgerSummary?: CostEventSummary | null;
  renderProfileId?: RenderProfileId | null;
}) {
  const { t, i18n } = useTranslation("run");
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "he";
  const level = estimate.isExpensive ? "expensive" : estimate.nis <= 5 ? "cheap" : "moderate";
  const briefDur = briefDurationSeconds ?? estimate.briefDurationSeconds;
  const showActual = actualCostNis != null && actualCostNis > 0;
  const ledgerRows = ledgerSummary ? ledgerBreakdownRows(ledgerSummary, locale, renderProfileId ?? estimate.renderProfileId) : [];
  const videoUnit = videoSecondsUnitLabel(renderProfileId ?? estimate.renderProfileId, locale);
  const modelDisplay = estimate.videoModelDisplay ?? estimate.videoModel;
  const showLedgerBreakdown = showActual && ledgerRows.length > 0;
  const attemptKeys = ledgerSummary
    ? Object.keys(ledgerSummary.byAttempt)
        .map(Number)
        .filter((n) => n > 0)
        .sort((a, b) => a - b)
    : [];
  const multiAttempt = attemptKeys.length > 1;
  return (
    <div className={`cost-indicator cost-${level}${compact ? " cost-compact" : ""}`} role="status" aria-live="polite">
      <div className="cost-indicator-head">
        <span className="cost-indicator-amount">{formatCostNis(showActual ? actualCostNis! : estimate.nis)}</span>
        <span className="cost-indicator-sub">
          {showActual ? t("costs.actual") : t("costs.estimated")}
        </span>
      </div>
      {multiAttempt && showActual ? (
        <p className="cost-indicator-warning">
          {t("costs.retryWarning")}
        </p>
      ) : null}
      {showActual && Math.abs(actualCostNis! - estimate.nis) > 0.5 ? (
        <p className="cost-indicator-actual-length muted">
          {t("costs.preRunEstimate", { amount: formatCostNis(estimate.nis) })}
          {multiAttempt ? <> · {t("costs.attempts", { count: attemptKeys.length })}</> : null}
        </p>
      ) : null}
      {briefDur != null ? (
        <p className="cost-indicator-actual-length">
          {t("costs.actualLength")}{" "}
          <strong>{t("costs.actualLengthDetails", { seconds: estimate.veoSeconds, scenes: estimate.sceneCount, bucket: estimate.bucket, unit: videoUnit })}</strong>
          {briefDur !== estimate.veoSeconds ? <> · {t("costs.briefLength", { seconds: briefDur })}</> : null}
        </p>
      ) : null}
      {estimate.warning ? <p className="cost-indicator-warning">{estimate.warning}</p> : null}
      {showBreakdown ? (
        showLedgerBreakdown ? (
          <ul className="cost-indicator-breakdown">
            <li className="muted">
              <strong>{t("costs.actualBreakdown")}</strong>
            </li>
            {ledgerRows.map((row) => (
              <li key={row.label}>
                <strong>{row.label}:</strong> {formatCostNis(row.nis)} · ${row.usd.toFixed(2)} ({t("costs.rows", { count: row.count })})
              </li>
            ))}
            <li>
              <strong>{t("costs.model")}:</strong> <code>{modelDisplay}</code>
            </li>
          </ul>
        ) : (
          <ul className="cost-indicator-breakdown">
            <li className="muted">
              <strong>{t("costs.estimateBreakdown")}</strong>
            </li>
            <li>
              <strong>{estimate.videoProviderLabel}:</strong> {estimate.veoTierLabel} · {estimate.sceneCount} × {estimate.bucket}s ={" "}
              <strong>{estimate.veoSeconds}s</strong> (~${estimate.veoUsd.toFixed(2)})
            </li>
            <li>
              <strong>{t("costs.images")}:</strong> {t("costs.calls", { count: estimate.imageCalls })} (~${estimate.imageUsd.toFixed(2)})
            </li>
            <li>
              <strong>TTS + text:</strong> ~${(estimate.ttsUsd + estimate.textUsd).toFixed(2)}
            </li>
            <li>
              <strong>{t("costs.model")}:</strong> <code>{modelDisplay}</code>
            </li>
            <li>
              <strong>{t("costs.mode")}:</strong> {estimate.label}
            </li>
          </ul>
        )
      ) : null}
      {estimate.isExpensive ? (
        <p className="cost-indicator-danger">
          {t("costs.expensive", { amount: formatCostNis(estimate.nis) })}
        </p>
      ) : null}
    </div>
  );
}

export function CostConfirmCheckbox({
  checked,
  onChange,
  estimate
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  estimate: RunCostEstimate;
}) {
  const { t } = useTranslation("run");
  if (!estimate.isExpensive) return null;
  return (
    <label className="cost-confirm-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {t("costs.confirmExpensive", { amount: formatCostNis(estimate.nis) })}
    </label>
  );
}
