import {
  activityTypeLabel,
  formatCostNis,
  pricingSourceLabel,
  type CostActivityType,
  type CostEventSummary,
  type CostEventView,
  type CostPricingSource,
  type StageName
} from "@studio/shared";
import { STAGE_LABELS } from "./StageOutputs.js";

export interface CostLedgerResponse {
  events: CostEventView[];
  summary: CostEventSummary;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function readPricingSource(event: CostEventView): CostPricingSource | undefined {
  const fromMeta = event.metadata?.pricingSource;
  if (fromMeta === "usage_metadata" || fromMeta === "estimate" || fromMeta === "request_params") {
    return fromMeta;
  }
  return undefined;
}

function readTokenCounts(event: CostEventView): { input?: number; output?: number } {
  const input = event.metadata?.inputTokens ?? event.metadata?.input_tokens;
  const output = event.metadata?.outputTokens ?? event.metadata?.output_tokens;
  return {
    input: typeof input === "number" ? input : undefined,
    output: typeof output === "number" ? output : undefined
  };
}

function formatUnits(event: CostEventView): string {
  switch (event.unit) {
    case "veo_seconds":
      return `${event.billedUnits}s Veo`;
    case "tokens":
      return `${Math.round(event.billedUnits).toLocaleString()} tokens`;
    case "image_call":
      return "1 תמונה";
    case "text_call":
      return "1 קריאת text";
    case "tts_call":
      return `${Math.round(event.billedUnits)} תווים`;
    case "music_seconds":
      return `${event.billedUnits}s מוזיקה`;
    case "bytes": {
      const mb = event.billedUnits / (1024 * 1024);
      return mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.round(event.billedUnits / 1024)} KB`;
    }
    default:
      return String(event.billedUnits);
  }
}

function summaryRows(summary: CostEventSummary): Array<{ label: string; nis: number; count: number }> {
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
      return { label: activityTypeLabel(type), nis: row.nis, count: row.count };
    })
    .filter((row): row is { label: string; nis: number; count: number } => row != null);
}

export function CostLedger({ ledger }: { ledger: CostLedgerResponse | null }) {
  if (!ledger || ledger.events.length === 0) {
    return (
      <section className="cost-ledger cost-ledger-empty">
        <h3>לוג עלויות</h3>
        <p className="muted">אין עדיין רשומות עלות לריצה זו. אירועים יופיעו כששלבי ה-pipeline רצים.</p>
      </section>
    );
  }

  const { events, summary } = ledger;
  const breakdown = summaryRows(summary);
  const measuredCount = events.filter((e) => readPricingSource(e) === "usage_metadata").length;
  const estimateCount = events.filter((e) => readPricingSource(e) === "estimate").length;

  return (
    <section className="cost-ledger">
      <header className="cost-ledger-head">
        <h3>לוג עלויות (לפי usageMetadata / תערифון Google)</h3>
        <p className="cost-ledger-total">
          סה״כ: <strong>{formatCostNis(summary.totalNis)}</strong>
          <span className="muted"> · ${summary.totalUsd.toFixed(2)}</span>
        </p>
      </header>
      <p className="cost-ledger-note muted">
        {measuredCount > 0 ? `${measuredCount} שורות מדודות (tokens מ-Gemini)` : null}
        {measuredCount > 0 && estimateCount > 0 ? " · " : null}
        {estimateCount > 0 ? `${estimateCount} שורות משוערות (fallback)` : null}
        {measuredCount === 0 && estimateCount === 0 ? "Veo לפי פרמטרי בקשה (שניות × מודל)." : null}
        {" "}שורות charged=no מוצגות כ-₪0.
      </p>
      {breakdown.length > 0 ? (
        <ul className="cost-ledger-summary">
          {breakdown.map((row) => (
            <li key={row.label}>
              <strong>{row.label}:</strong> {formatCostNis(row.nis)} ({row.count})
            </li>
          ))}
        </ul>
      ) : null}
      <div className="cost-ledger-table-wrap">
        <table className="cost-ledger-table">
          <thead>
            <tr>
              <th>תאריך/שעה</th>
              <th>שלב</th>
              <th>attempt</th>
              <th>פעילות</th>
              <th>מודל</th>
              <th>מקור</th>
              <th>tokens</th>
              <th>זמן</th>
              <th>יחידות</th>
              <th>₪</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const source = readPricingSource(event);
              const tokens = readTokenCounts(event);
              return (
                <tr key={event.id} className={event.charged === "no" ? "cost-row-free" : undefined}>
                  <td>{new Date(event.startedAt).toLocaleString()}</td>
                  <td>{STAGE_LABELS[event.stage as StageName] ?? event.stage}</td>
                  <td>
                    {event.attempt && event.attempt > 1 ? (
                      <span className="badge badge-queued">#{event.attempt}</span>
                    ) : (
                      event.attempt ?? 1
                    )}
                  </td>
                  <td>
                    {activityTypeLabel(event.activityType)}
                    {event.sceneId ? (
                      <>
                        <br />
                        <small className="muted">{event.sceneId}</small>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <code>{event.model ?? "—"}</code>
                  </td>
                  <td>
                    <span className={`cost-source cost-source-${source ?? "unknown"}`}>
                      {pricingSourceLabel(source)}
                    </span>
                  </td>
                  <td>
                    {tokens.input != null || tokens.output != null ? (
                      <small>
                        in: {tokens.input?.toLocaleString() ?? "—"}
                        <br />
                        out: {tokens.output?.toLocaleString() ?? "—"}
                      </small>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatDuration(event.durationMs)}</td>
                  <td>{formatUnits(event)}</td>
                  <td>
                    <strong>{formatCostNis(event.costNis)}</strong>
                    {event.charged === "no" ? <small className="muted"> (לא חויב)</small> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
