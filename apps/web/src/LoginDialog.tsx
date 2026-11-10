import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { authLoginUrl } from "./api.js";
import { LaunchOffer } from "./LaunchOffer.js";
import { useModalFocus } from "./useModalFocus.js";

function GoogleMark() {
  return (
    <svg className="login-google-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

export function LoginDialog({
  open,
  busy,
  error,
  codeSent,
  pendingEmail,
  onClose,
  onStart,
  onVerify,
  onBack,
  onHaveCode
}: {
  open: boolean;
  busy: boolean;
  error: string;
  codeSent: boolean;
  pendingEmail: string;
  onClose: () => void;
  onStart: (email: string, password: string) => Promise<void>;
  onVerify: (email: string, code: string) => Promise<void>;
  onBack: () => void;
  onHaveCode: (email: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"create" | "login">("create");
  const [localError, setLocalError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setCode("");
      setShowPassword(false);
      setLocalError("");
    }
  }, [open]);

  useEffect(() => {
    if (open && pendingEmail) setEmail(pendingEmail);
  }, [open, pendingEmail]);

  useEffect(() => {
    if (open && codeSent) codeRef.current?.focus();
  }, [open, codeSent]);

  if (!open) return null;

  const shownError = localError || error;
  const title = codeSent ? t("auth.titleCode") : mode === "create" ? t("auth.titleCreate") : t("auth.titleLogin");
  const lead = codeSent
    ? t("auth.leadCode", { email: email || pendingEmail })
    : mode === "create"
      ? t("auth.leadCreate")
      : t("auth.leadLogin");

  function fieldValue(form: HTMLFormElement, name: string, fallback: string): string {
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el.value : fallback;
  }

  function pastePassword(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    const el = event.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setPassword(el.value.slice(0, start) + text + el.value.slice(end));
    setLocalError("");
  }

  function acceptCode(raw: string) {
    if (/[^0-9\s-]/.test(raw)) {
      setLocalError(t("auth.codeNotPassword"));
      return;
    }
    setLocalError("");
    setCode(raw.replace(/\D/g, "").slice(0, 6));
  }

  return (
    <div className="whats-new-overlay" data-modal-root onClick={onClose}>
      <div
        ref={dialogRef}
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
        <ol className="login-steps" aria-label={t("auth.progress")}>
          <li className={codeSent ? "done" : "current"}>{t("auth.stepAccount")}</li>
          <li className={codeSent ? "current" : ""}>{t("auth.stepCode")}</li>
          <li>{t("auth.stepEnter")}</li>
        </ol>
        <h2 id="login-title">{title}</h2>
        <p className="muted">{lead}</p>
        {codeSent || mode === "login" ? null : <LaunchOffer compact />}
        {codeSent ? null : (
          <div className="login-mode" role="tablist" aria-label={t("auth.progress")}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "create"}
              className={mode === "create" ? "active" : ""}
              onClick={() => setMode("create")}
            >
              {t("auth.modeCreate")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              {t("auth.modeLogin")}
            </button>
          </div>
        )}
        <form
          className="login-form"
          autoComplete="on"
          onSubmit={(event) => {
            event.preventDefault();
            setLocalError("");
            const form = event.currentTarget;
            const emailValue = fieldValue(form, "email", email).trim();
            if (codeSent) {
              const codeValue = fieldValue(form, "otp", code).replace(/\D/g, "").slice(0, 6);
              void onVerify(emailValue, codeValue);
              return;
            }
            const passwordValue = fieldValue(form, "password", password);
            void onStart(emailValue, passwordValue);
          }}
        >
          <label htmlFor="login-email">
            {t("auth.email")}
            <input
              id="login-email"
              type="email"
              name="email"
              dir="ltr"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              readOnly={busy || codeSent}
            />
          </label>
          {codeSent ? (
            <label htmlFor="login-code">
              {t("auth.code")}
              <input
                id="login-code"
                ref={codeRef}
                type="text"
                name="otp"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => acceptCode(event.target.value)}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (!text) return;
                  event.preventDefault();
                  acceptCode(text);
                }}
                readOnly={busy}
              />
            </label>
          ) : (
            <label htmlFor="login-password">
              {t("auth.password")}
              <span className="login-password" dir="ltr">
                <input
                  id="login-password"
                  key={mode}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  dir="ltr"
                  autoComplete={mode === "create" ? "new-password" : "current-password"}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setLocalError("");
                  }}
                  onInput={(event) => setPassword(event.currentTarget.value)}
                  onPaste={pastePassword}
                  readOnly={busy}
                />
                <button
                  type="button"
                  className="login-reveal"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                </button>
              </span>
              <small>{t("auth.passwordHint")}</small>
            </label>
          )}
          {codeSent ? <p className="muted login-next">{t("auth.sent")}</p> : null}
          {shownError ? <p className="error-inline">{shownError}</p> : null}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t("auth.working") : codeSent ? t("auth.verify") : t("auth.sendCode")}
          </button>
        </form>
        {codeSent ? (
          <div className="login-links">
            <button
              type="button"
              className="login-text-btn"
              disabled={busy}
              onClick={() => {
                if (password.trim().length < 8) {
                  setLocalError(t("auth.resendNeedPassword"));
                  onBack();
                  return;
                }
                setLocalError("");
                void onStart(email, password);
              }}
            >
              {t("auth.resend")}
            </button>
            <button
              type="button"
              className="login-text-btn"
              disabled={busy}
              onClick={() => {
                setCode("");
                setLocalError("");
                onBack();
              }}
            >
              {t("auth.changeEmail")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="login-text-btn"
            disabled={busy}
            onClick={() => {
              if (!email.includes("@")) {
                setLocalError(t("auth.errors.invalid_email"));
                return;
              }
              setLocalError("");
              onHaveCode(email);
            }}
          >
            {t("auth.haveCode")}
          </button>
        )}
        {codeSent ? null : (
          <>
            <div className="login-divider">
              <span>{t("auth.or")}</span>
            </div>
            <a className="button-secondary login-google" href={authLoginUrl()}>
              <GoogleMark />
              {t("auth.google")}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
