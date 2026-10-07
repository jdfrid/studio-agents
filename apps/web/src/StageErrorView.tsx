import { parseStageError } from "@studio/shared";
import { useTranslation } from "react-i18next";

export function StageErrorView({ error }: { error: string | null }) {
  const { t } = useTranslation("run");
  if (!error) return null;
  const parsed = parseStageError(error);
  const friendly = parsed.friendly || t("stageError.generic");

  return (
    <div className={`stage-error stage-error-${parsed.kind}`}>
      <p className="stage-error-friendly">{friendly}</p>
      <p className="stage-error-kind muted">{t("stageError.supportHint")}</p>
    </div>
  );
}
