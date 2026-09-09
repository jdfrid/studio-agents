import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { LandingPage } from "./LandingPage.js";
import { Dashboard } from "./Dashboard.js";
import { CreateVideoForm } from "./CreateVideoForm.js";
import { RunView } from "./RunView.js";
import { DistributionPage } from "./DistributionPage.js";
import { AboutPage, ContactPage, LegalPage, PricingPage } from "./SitePages.js";
import { applySeo, defaultSeo } from "./seo.js";
import type { ProjectRunView } from "./types.js";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.js";
import "./styles.css";

type AppView =
  | "landing"
  | "dashboard"
  | "create"
  | "run"
  | "distribution"
  | "about"
  | "contact"
  | "terms"
  | "privacy"
  | "legal"
  | "pricing";

type AppLocation = {
  view: AppView;
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
  if (path === "/about") return { view: "about", runId: null };
  if (path === "/contact") return { view: "contact", runId: null };
  if (path === "/terms") return { view: "terms", runId: null };
  if (path === "/privacy") return { view: "privacy", runId: null };
  if (path === "/legal") return { view: "legal", runId: null };
  if (path === "/pricing") return { view: "pricing", runId: null };
  return { view: "landing", runId: null };
}

function pathFor(loc: AppLocation): string {
  if (loc.view === "run" && loc.runId) return `/runs/${loc.runId}`;
  if (loc.view === "create") return "/create";
  if (loc.view === "distribution") return "/distribution";
  if (loc.view === "about") return "/about";
  if (loc.view === "contact") return "/contact";
  if (loc.view === "terms") return "/terms";
  if (loc.view === "privacy") return "/privacy";
  if (loc.view === "legal") return "/legal";
  if (loc.view === "pricing") return "/pricing";
  return "/";
}

function AppShell() {
  const { t } = useTranslation();
  const { t: st } = useTranslation("site");
  const { user, logout } = useAuth();
  const initial = parseLocation();
  const [view, setView] = useState<AppView>(initial.view);
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

  const goPublic = useCallback(
    (path: string) => {
      if (path === "/") {
        navigate({ view: user ? "dashboard" : "landing", runId: null });
        return;
      }
      const map: Record<string, AppView> = {
        "/about": "about",
        "/contact": "contact",
        "/terms": "terms",
        "/privacy": "privacy",
        "/legal": "legal",
        "/pricing": "pricing"
      };
      navigate({ view: map[path] ?? "landing", runId: null });
    },
    [navigate, user]
  );

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

  useEffect(() => {
    if (view === "distribution" && user && user.role !== "ADMIN") {
      navigate({ view: "dashboard", runId: null }, "replace");
    }
  }, [navigate, user, view]);

  useEffect(() => {
    const path = pathFor({ view, runId });
    if (view === "about") applySeo({ title: `${st("about.title")} | Prompt2Spot`, description: st("about.lead"), path });
    else if (view === "contact") applySeo({ title: `${st("contact.title")} | Prompt2Spot`, description: st("contact.lead"), path });
    else if (view === "terms") applySeo({ title: `${st("legal.terms.title")} | Prompt2Spot`, description: st("legal.terms.updated"), path });
    else if (view === "privacy") applySeo({ title: `${st("legal.privacy.title")} | Prompt2Spot`, description: st("legal.privacy.updated"), path });
    else if (view === "legal") applySeo({ title: `${st("legal.commercial.title")} | Prompt2Spot`, description: st("legal.commercial.updated"), path });
    else if (view === "pricing") applySeo({ title: `${t("landing.plans.title")} | Prompt2Spot`, description: st("pricing.checkoutLead"), path });
    else applySeo({ ...defaultSeo, path: path === "/" ? "/" : path });
  }, [st, t, view, runId]);

  const publicContent = view === "about" || view === "contact" || view === "terms" || view === "privacy" || view === "legal" || view === "pricing";
  if (publicContent) {
    if (view === "about") return <AboutPage onNavigate={goPublic} />;
    if (view === "contact") return <ContactPage onNavigate={goPublic} />;
    if (view === "terms") return <LegalPage kind="terms" onNavigate={goPublic} />;
    if (view === "privacy") return <LegalPage kind="privacy" onNavigate={goPublic} />;
    if (view === "legal") return <LegalPage kind="commercial" onNavigate={goPublic} />;
    return <PricingPage onNavigate={goPublic} />;
  }

  if (!user) return <LandingPage onNavigate={goPublic} />;

  const appView = view === "landing" ? "dashboard" : view;

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
            className={appView === "dashboard" ? "nav-active" : ""}
            onClick={() => navigate({ view: "dashboard", runId: null })}
          >
            <span aria-hidden>▦</span>
            {t("shell.myVideos")}
          </button>
          <button
            type="button"
            className={appView === "create" ? "nav-active" : ""}
            disabled={!user.canCreateVideo}
            onClick={() => navigate({ view: "create", runId: null })}
          >
            <span aria-hidden>＋</span>
            {t("shell.newCreation")}
          </button>
          {user.role === "ADMIN" ? (
            <button
              type="button"
              className={appView === "distribution" ? "nav-active" : ""}
              onClick={() => navigate({ view: "distribution", runId: null })}
            >
              <span aria-hidden>↗</span>
              {t("shell.distribute")}
            </button>
          ) : null}
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
        {appView === "dashboard" && (
          <Dashboard
            onNewVideo={() => {
              if (user.canCreateVideo) navigate({ view: "create", runId: null });
            }}
            onOpenRun={(id) => navigate({ view: "run", runId: id })}
          />
        )}
        {appView === "create" && (
          <CreateVideoForm
            onCreated={(run: ProjectRunView) => navigate({ view: "run", runId: run.id })}
            onCancel={() => navigate({ view: "dashboard", runId: null })}
          />
        )}
        {appView === "run" && runId ? (
          <RunView runId={runId} onBack={() => navigate({ view: "dashboard", runId: null })} />
        ) : null}
        {appView === "distribution" && user.role === "ADMIN" ? <DistributionPage /> : null}
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
