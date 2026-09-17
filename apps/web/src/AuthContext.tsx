import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiPost, apiGet } from "./api.js";
import { LoginDialog } from "./LoginDialog.js";
import type { UserView } from "@studio/shared";

type AuthState = {
  user: UserView | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const AUTH_ERROR_CODES = [
  "invalid_email",
  "invalid_password",
  "invalid_credentials",
  "use_google",
  "rate_limited",
  "mail_not_configured",
  "otp_invalid",
  "otp_expired",
  "mail_failed"
] as const;

function authErrorMessage(err: unknown, t: (key: string) => string): string {
  const raw = err instanceof Error ? err.message : "";
  if (AUTH_ERROR_CODES.includes(raw as (typeof AUTH_ERROR_CODES)[number])) {
    return t(`auth.errors.${raw}`);
  }
  return t("auth.errors.generic");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<UserView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  async function refresh() {
    try {
      const me = await apiGet<UserView>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    setBusy(false);
    setError("");
    setCodeSent(false);
    setPendingEmail("");
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    setUser(null);
  }

  async function startEmail(email: string, password: string) {
    setBusy(true);
    setError("");
    try {
      await apiPost("/auth/email/start", { email, password, locale: i18n.resolvedLanguage });
      setPendingEmail(email);
      setCodeSent(true);
    } catch (err) {
      setError(authErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail(email: string, code: string) {
    setBusy(true);
    setError("");
    try {
      const me = await apiPost<UserView>("/auth/email/verify", { email: pendingEmail || email, code });
      setUser(me);
      closeLogin();
    } catch (err) {
      setError(authErrorMessage(err, t));
      setBusy(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        refresh,
        login: () => {
          setError("");
          setLoginOpen(true);
        },
        logout
      }}
    >
      {children}
      <LoginDialog
        open={loginOpen}
        busy={busy}
        error={error}
        codeSent={codeSent}
        onClose={closeLogin}
        onStart={startEmail}
        onVerify={verifyEmail}
        onBack={() => {
          setCodeSent(false);
          setError("");
        }}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
