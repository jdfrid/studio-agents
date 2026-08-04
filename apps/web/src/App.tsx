import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { LandingPage } from "./LandingPage.js";
import { Dashboard } from "./Dashboard.js";
import { CreateVideoForm } from "./CreateVideoForm.js";
import { RunView } from "./RunView.js";
import type { ProjectRunView } from "./types.js";
import "./styles.css";

type View = "landing" | "dashboard" | "create" | "run";

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
  return { view: "dashboard", runId: null };
}

function pathFor(loc: AppLocation): string {
  if (loc.view === "run" && loc.runId) return `/runs/${loc.runId}`;
  if (loc.view === "create") return "/create";
  return "/";
}

function AppShell() {
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

  if (loading) return <p className="muted center">טוען…</p>;
  if (!user) return <LandingPage />;

  return (
    <div className="layout saas-layout">
      <header className="saas-header">
        <strong className="brand">Prompt2Spot</strong>
        <nav>
          <button
            type="button"
            className={view === "dashboard" ? "nav-active" : ""}
            onClick={() => navigate({ view: "dashboard", runId: null })}
          >
            הסרטונים שלי
          </button>
        </nav>
        <div className="header-user">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="avatar" /> : null}
          <span>{user.email}</span>
          <button type="button" className="link-btn" onClick={() => void logout()}>
            יציאה
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
