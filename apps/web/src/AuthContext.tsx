import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, authLoginUrl } from "./api.js";
import type { UserView } from "@studio/shared";

type AuthState = {
  user: UserView | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserView | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, refresh, login: () => { window.location.href = authLoginUrl(); }, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
