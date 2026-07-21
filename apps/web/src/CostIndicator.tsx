import type { RunCostEstimate } from "@studio/shared";
import { formatCostNis } from "@studio/shared";

export function CostIndicator({
  estimate,
  compact = false,
  showBreakdown = true,
  briefDurationSeconds,
  actualCostNis
}: {
  estimate: RunCostEstimate;
  compact?: boolean;
  showBreakdown?: boolean;
  /** Brief target length — when different from veoSeconds, show both. */
  briefDurationSeconds?: number;
  /** Sum from Cost Ledger after run (usageMetadata-based when available). */
  actualCostNis?: number | null;
}) {
  const level = estimate.isExpensive ? "expensive" : estimate.nis <= 5 ? "cheap" : "moderate";
  const briefDur = briefDurationSeconds ?? estimate.briefDurationSeconds;
  const showActual = actualCostNis != null && actualCostNis > 0;
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
          הערכה לפני ריצה: {formatCostNis(estimate.nis)}
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
        <ul className="cost-indicator-breakdown">
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
