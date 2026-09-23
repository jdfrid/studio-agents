import { useTranslation } from "react-i18next";
import { BRAND_POSTERS, type BrandPosterId } from "./posters.js";

export function CampaignPreview({
  kind = "coffee",
  caption
}: {
  kind?: BrandPosterId;
  caption?: string;
}) {
  const { t } = useTranslation();
  const poster = BRAND_POSTERS.find((item) => item.id === kind) ?? BRAND_POSTERS[0];
  return (
    <div className="mini-preview">
      <img src={poster.src} alt={t(`landing.posters.${poster.labelKey}`)} />
      <span className="preview-label">{t("landing.showcase.conceptArt")}</span>
      {caption ? <p className="preview-copy">{caption}</p> : null}
    </div>
  );
}
