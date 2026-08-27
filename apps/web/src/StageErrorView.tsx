import { parseStageError, type GeminiErrorKind } from "@studio/shared";
import { useTranslation } from "react-i18next";

export function StageErrorView({ error }: { error: string | null }) {
  const { t } = useTranslation("run");
  if (!error) return null;
  const parsed = parseStageError(error);
  const friendly = parsed.friendly || error;
  const showRaw = Boolean(parsed.raw);

  return (
    <div className={`stage-error stage-error-${parsed.kind}`}>
      <p className="stage-error-friendly">{friendly}</p>
      {parsed.kind !== "unknown" ? (
        <p className="stage-error-kind muted">
          <strong>{t("stageError.type")}:</strong> {t(`stageError.kinds.${parsed.kind as GeminiErrorKind}`)}
          {parsed.httpStatus != null ? <> · {t("stageError.httpCode", { code: parsed.httpStatus })}</> : null}
          {parsed.quotaHint ? <> · {parsed.quotaHint}</> : null}
        </p>
      ) : null}
      {showRaw ? (
        <details className="stage-error-raw">
          <summary>{t("stageError.technicalDetails")}</summary>
          <pre>{parsed.raw}</pre>
        </details>
      ) : (
        <p className="stage-error-kind muted">{t("stageError.missingDetails")}</p>
      )}
    </div>
  );
}
