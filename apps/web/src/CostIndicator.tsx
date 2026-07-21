import type { RunCostEstimate, CostEventSummary, CostActivityType } from "@studio/shared";
import { activityTypeLabel, formatCostNis } from "@studio/shared";

function ledgerBreakdownRows(summary: CostEventSummary): Array<{ label: string; nis: number; usd: number; count: number }> {
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
      return { label: activityTypeLabel(type), nis: row.nis, usd: row.usd, count: row.count };
    })
    .filter((row): row is { label: string; nis: number; usd: number; count: number } => row != null);
}

export function CostIndicator({
  estimate,
  compact = false,
  showBreakdown = true,
  briefDurationSeconds,
  actualCostNis,
  ledgerSummary
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
}) {
  const level = estimate.isExpensive ? "expensive" : estimate.nis <= 5 ? "cheap" : "moderate";
  const briefDur = briefDurationSeconds ?? estimate.briefDurationSeconds;
  const showActual = actualCostNis != null && actualCostNis > 0;
  const ledgerRows = ledgerSummary ? ledgerBreakdownRows(ledgerSummary) : [];
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
          {showActual ? "עלות בפועל (Cost Ledger)" : "משוער לפני ריצה (תערифון)"}
        </span>
      </div>
      {showActual && Math.abs(actualCostNis! - estimate.nis) > 0.5 ? (
        <p className="cost-indicator-actual-length muted">
          הערכה לפני ריצה (ריצה אחת): {formatCostNis(estimate.nis)}
          {multiAttempt ? <> · {attemptKeys.length} attempts בריצה זו</> : null}
        </p>
      ) : null}
      {briefDur != null ? (
        <p className="cost-indicator-actual-length">
          אורך וידאו בפועל: <strong>{estimate.veoSeconds}s</strong> ({estimate.sceneCount} סצנות × {estimate.bucket}s)
          {briefDur !== estimate.veoSeconds ? <> · brief: {briefDur}s</> : null}
        </p>
      ) : null}
      {estimate.warning ? <p className="cost-indicator-warning">{estimate.warning}</p> : null}
      {showBreakdown ? (
        showLedgerBreakdown ? (
          <ul className="cost-indicator-breakdown">
            <li className="muted">
              <strong>פירוט בפועל (Cost Ledger):</strong>
            </li>
            {ledgerRows.map((row) => (
              <li key={row.label}>
                <strong>{row.label}:</strong> {formatCostNis(row.nis)} · ${row.usd.toFixed(2)} ({row.count} שורות)
              </li>
            ))}
            <li>
              <strong>מודל בשרת:</strong> <code>{estimate.videoModel}</code>
            </li>
          </ul>
        ) : (
          <ul className="cost-indicator-breakdown">
            <li className="muted">
              <strong>הערכה לריצה אחת (לפני ריצה):</strong>
            </li>
            <li>
              <strong>Veo:</strong> {estimate.veoTierLabel} · {estimate.sceneCount} סצנות × {estimate.bucket}s ={" "}
              <strong>{estimate.veoSeconds}s</strong> (~${estimate.veoUsd.toFixed(2)})
            </li>
            <li>
              <strong>תמונות:</strong> {estimate.imageCalls} קריאות (~${estimate.imageUsd.toFixed(2)})
            </li>
            <li>
              <strong>TTS + text:</strong> ~${(estimate.ttsUsd + estimate.textUsd).toFixed(2)}
            </li>
            <li>
              <strong>מודל בשרת:</strong> <code>{estimate.videoModel}</code>
            </li>
            <li>
              <strong>מצב:</strong> {estimate.label}
            </li>
          </ul>
        )
      ) : null}
      {estimate.isExpensive ? (
        <p className="cost-indicator-danger">
          ריצה אחת עלולה לעלות כ-{formatCostNis(estimate.nis)}. ודא שיש מספיק יתרה ב-Google Cloud לפני שממשיכים.
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
  if (!estimate.isExpensive) return null;
  return (
    <label className="cost-confirm-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      אני מבין/ה שריצה זו עלולה לעלות {formatCostNis(estimate.nis)} ומאשר/ת להמשיך
    </label>
  );
}
