import { parseStageError, type GeminiErrorKind } from "@studio/shared";

function kindLabel(kind: GeminiErrorKind): string {
  switch (kind) {
    case "rate_limit":
      return "מגבלת קצב / מכסה זמנית";
    case "billing_quota":
      return "יתרה / תשלום";
    case "auth":
      return "הרשאות";
    default:
      return "שגיאה";
  }
}

export function StageErrorView({ error }: { error: string | null }) {
  if (!error) return null;
  const parsed = parseStageError(error);
  const friendly = parsed.friendly || error;
  const showRaw = parsed.raw && parsed.raw !== friendly;

  return (
    <div className={`stage-error stage-error-${parsed.kind}`}>
      <p className="stage-error-friendly">{friendly}</p>
      {parsed.kind !== "unknown" ? (
        <p className="stage-error-kind muted">
          <strong>סוג:</strong> {kindLabel(parsed.kind)}
          {parsed.httpStatus != null ? <> · HTTP {parsed.httpStatus}</> : null}
          {parsed.quotaHint ? <> · {parsed.quotaHint}</> : null}
        </p>
      ) : null}
      {showRaw ? (
        <details className="stage-error-raw">
          <summary>שגיאה מקורית מ-Google (JSON / טקst)</summary>
          <pre>{parsed.raw}</pre>
        </details>
      ) : null}
    </div>
  );
}
