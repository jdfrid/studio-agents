import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "./i18n/format.js";
import type { WhatsNewEntry } from "./whatsNew.js";

export function WhatsNewDialog({
  open,
  entries,
  sinceLastVisit,
  onClose
}: {
  open: boolean;
  entries: WhatsNewEntry[];
  sinceLastVisit: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="whats-new-overlay" onClick={onClose}>
      <div
        className="whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="whats-new-close" onClick={onClose} aria-label={t("whatsNew.close")}>
          ×
        </button>
        <p className="eyebrow">{t("whatsNew.eyebrow")}</p>
        <h2 id="whats-new-title">{sinceLastVisit ? t("whatsNew.titleSince") : t("whatsNew.title")}</h2>
        <ul className="whats-new-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <time dateTime={entry.date}>
                {formatDate(`${entry.date}T12:00:00`, { day: "numeric", month: "short", year: "numeric" })}
              </time>
              <strong>{t(`whatsNew.items.${entry.id}.title`)}</strong>
              <p>{t(`whatsNew.items.${entry.id}.body`)}</p>
            </li>
          ))}
        </ul>
        <p className="whats-new-hint">{t("whatsNew.hint")}</p>
      </div>
    </div>
  );
}
