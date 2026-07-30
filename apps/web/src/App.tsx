import { useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { LandingPage } from "./LandingPage.js";
import { Dashboard } from "./Dashboard.js";
import { CreateVideoForm } from "./CreateVideoForm.js";
import { RunView } from "./RunView.js";
import type { ProjectRunView } from "./types.js";
import "./styles.css";

type View = "landing" | "dashboard" | "create" | "run";

function AppShell() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState<View>("dashboard");
  const [runId, setRunId] = useState<string | null>(null);

  if (loading) return <p className="muted center">טוען…</p>;
  if (!user) return <LandingPage />;

  return (
    <div className="layout saas-layout">
      <header className="saas-header">
        <strong className="brand">Prompt2Spot</strong>
        <nav>
          <button type="button" className={view === "dashboard" ? "nav-active" : ""} onClick={() => setView("dashboard")}>
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
            onNewVideo={() => setView("create")}
            onOpenRun={(id) => {
              setRunId(id);
              setView("run");
            }}
          />
        )}
        {view === "create" && (
          <CreateVideoForm
            onCreated={(run: ProjectRunView) => {
              setRunId(run.id);
              setView("run");
            }}
            onCancel={() => setView("dashboard")}
          />
        )}
        {view === "run" && runId ? (
          <RunView
            runId={runId}
            onBack={() => {
              setRunId(null);
              setView("dashboard");
            }}
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
