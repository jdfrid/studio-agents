import { useTranslation } from "react-i18next";

/** Launch price strip with the red badge. */
export function LaunchOffer({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <aside className={compact ? "launch-offer launch-offer-compact" : "launch-offer"}>
      <span className="launch-badge">{t("launch.badge")}</span>
      <ul>
        <li>{t("launch.single")}</li>
        <li>{t("launch.monthly")}</li>
        <li>{t("launch.yearly")}</li>
      </ul>
    </aside>
  );
}
