import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { LandingPage } from "./LandingPage.js";
import { Dashboard } from "./Dashboard.js";
import { CreateVideoForm } from "./CreateVideoForm.js";
import { RunView } from "./RunView.js";
import { DistributionPage } from "./DistributionPage.js";
import type { ProjectRunView } from "./types.js";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.js";
import "./styles.css";

type View = "landing" | "dashboard" | "create" | "run" | "distribution";

type AppLocation = {
  view: View;
  runId: string | null;
};

function parseLocation(): AppLocation {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/runs/")) {
    const id = path.slice("/runs/".length).split("/")[0] ?? "";
    if (id) return { view: "run", runId: id };
  }
  if (path === "/create") return { view: "create", runId: null };
  if (path.startsWith("/distribution")) return { view: "distribution", runId: null };
  return { view: "dashboard", runId: null };
}

function pathFor(loc: AppLocation): string {
  if (loc.view === "run" && loc.runId) return `/runs/${loc.runId}`;
  if (loc.view === "create") return "/create";
  if (loc.view === "distribution") return "/distribution";
  return "/";
}

function AppShell() {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const initial = parseLocation();
  const [view, setView] = useState<View>(initial.view === "landing" ? "dashboard" : initial.view);
  const [runId, setRunId] = useState<string | null>(initial.runId);

  const navigate = useCallback((next: AppLocation, mode: "push" | "replace" = "push") => {
    setView(next.view);
    setRunId(next.runId);
    const path = pathFor(next);
    if (path !== window.location.pathname) {
      if (mode === "replace") window.history.replaceState(next, "", path);
      else window.history.pushState(next, "", path);
    }
  }, []);

  useEffect(() => {
    // Normalize URL when logged-in user lands on /
    if (user && window.location.pathname === "/") {
      window.history.replaceState({ view: "dashboard", runId: null }, "", "/");
    }
  }, [user]);

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const state = event.state as AppLocation | null;
      if (state?.view) {
        setView(state.view);
        setRunId(state.runId);
        return;
      }
      const loc = parseLocation();
      setView(loc.view);
      setRunId(loc.runId);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (loading) return <p className="muted center">{t("shell.loading")}</p>;
  if (!user) return <LandingPage />;

  return (
    <div className="layout saas-layout">
      <header className="saas-header">
        <button
          type="button"
          className="brand-lockup"
          onClick={() => navigate({ view: "dashboard", runId: null })}
          aria-label={t("shell.homeLabel")}
        >
          <span className="brand-mark" aria-hidden>
            P2
          </span>
          <span className="brand-copy">
            <strong className="brand">Prompt2Spot</strong>
            <small>{t("common.brandTagline")}</small>
          </span>
        </button>
        <nav className="saas-nav" aria-label={t("shell.primaryNav")}>
          <button
            type="button"
            className={view === "dashboard" ? "nav-active" : ""}
            onClick={() => navigate({ view: "dashboard", runId: null })}
          >
            <span aria-hidden>▦</span>
            {t("shell.myVideos")}
          </button>
          <button
            type="button"
            className={view === "create" ? "nav-active" : ""}
            disabled={!user.canCreateVideo}
            onClick={() => navigate({ view: "create", runId: null })}
          >
            <span aria-hidden>＋</span>
            {t("shell.newCreation")}
          </button>
          <button
            type="button"
            className={view === "distribution" ? "nav-active" : ""}
            onClick={() => navigate({ view: "distribution", runId: null })}
          >
            <span aria-hidden>↗</span>
            {t("shell.distribute")}
          </button>
        </nav>
        <div className="header-user">
          <LanguageSwitcher compact />
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="avatar" />
          ) : (
            <span className="avatar avatar-fallback" aria-hidden>
              {(user.name || user.email || "P").slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="header-user-email">{user.email}</span>
          <button type="button" className="link-btn" onClick={() => void logout()}>
            {t("shell.logout")}
          </button>
        </div>
      </header>
      <main>
        {view === "dashboard" && (
          <Dashboard
            onNewVideo={() => {
              if (user.canCreateVideo) navigate({ view: "create", runId: null });
            }}
            onOpenRun={(id) => navigate({ view: "run", runId: id })}
          />
        )}
        {view === "create" && (
          <CreateVideoForm
            onCreated={(run: ProjectRunView) => navigate({ view: "run", runId: run.id })}
            onCancel={() => navigate({ view: "dashboard", runId: null })}
          />
        )}
        {view === "run" && runId ? (
          <RunView
            runId={runId}
            onBack={() => navigate({ view: "dashboard", runId: null })}
          />
        ) : null}
        {view === "distribution" ? <DistributionPage /> : null}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
