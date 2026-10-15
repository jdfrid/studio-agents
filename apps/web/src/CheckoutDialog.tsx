import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mount } from "@creem_io/embed";
import { useModalFocus } from "./useModalFocus.js";

export function CheckoutDialog({
  checkoutUrl,
  planName,
  onClose
}: {
  checkoutUrl: string | null;
  planName: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const open = Boolean(checkoutUrl);
  const dialogRef = useModalFocus<HTMLDivElement>(open, onClose);
  const frameRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!checkoutUrl || !frameRef.current) return;
    setReady(false);
    setCompleted(false);
    const handle = mount({
      checkoutUrl,
      container: frameRef.current,
      theme: "light",
      locale: i18n.resolvedLanguage === "he" ? "he" : "en",
      onReady: () => setReady(true),
      onComplete: () => setCompleted(true)
    });
    return () => handle.destroy();
  }, [checkoutUrl, i18n.resolvedLanguage]);

  if (!open) return null;

  return (
    <div className="whats-new-overlay" data-modal-root onClick={completed ? undefined : onClose}>
      <div
        ref={dialogRef}
        className="whats-new-dialog checkout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="whats-new-close" onClick={onClose} aria-label={t("auth.close")}>
          ×
        </button>
        <p className="eyebrow">{t("checkout.eyebrow")}</p>
        <h2 id="checkout-title">{planName}</h2>
        <p className="muted checkout-secure">{completed ? t("checkout.completed") : t("checkout.secure")}</p>
        <div className="checkout-frame">
          {!ready ? <p className="checkout-loading muted">{t("checkout.loading")}</p> : null}
          <div ref={frameRef} className="checkout-frame-inner" />
        </div>
      </div>
    </div>
  );
}
