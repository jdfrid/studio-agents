import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { authLoginUrl } from "./api.js";

export function LoginDialog({
  open,
  busy,
  error,
  codeSent,
  onClose,
  onStart,
  onVerify,
  onBack
}: {
  open: boolean;
  busy: boolean;
  error: string;
  codeSent: boolean;
  onClose: () => void;
  onStart: (email: string, password: string) => Promise<void>;
  onVerify: (email: string, code: string) => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) {
      setPassword("");
      setCode("");
      return;
    }
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
        className="whats-new-dialog login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="whats-new-close" onClick={onClose} aria-label={t("auth.close")}>
          ×
        </button>
        <p className="eyebrow">{t("auth.eyebrow")}</p>
        <h2 id="login-title">{t("auth.title")}</h2>
        <p className="muted">{t("auth.lead")}</p>
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (codeSent) void onVerify(email, code);
            else void onStart(email, password);
          }}
        >
          <label>
            {t("auth.email")}
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy || codeSent}
            />
          </label>
          {codeSent ? (
            <label>
              {t("auth.code")}
              <input
                type="text"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
              />
            </label>
          ) : (
            <label>
              {t("auth.password")}
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
              <small>{t("auth.passwordHint")}</small>
            </label>
          )}
          {codeSent ? <p className="muted">{t("auth.sent")}</p> : null}
          {error ? <p className="error-inline">{error}</p> : null}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t("auth.working") : codeSent ? t("auth.verify") : t("auth.sendCode")}
          </button>
        </form>
        {codeSent ? (
          <button
            type="button"
            className="nav-text"
            disabled={busy}
            onClick={() => {
              setCode("");
              onBack();
            }}
          >
            {t("auth.changeEmail")}
          </button>
        ) : null}
        <div className="login-divider">
          <span>{t("auth.or")}</span>
        </div>
        <a className="button-secondary login-google" href={authLoginUrl()}>
          {t("auth.google")}
        </a>
      </div>
    </div>
  );
}
