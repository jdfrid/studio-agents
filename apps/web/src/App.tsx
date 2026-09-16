import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { LandingPage } from "./LandingPage.js";
import { Dashboard } from "./Dashboard.js";
import { CreateVideoForm } from "./CreateVideoForm.js";
import { RunView } from "./RunView.js";
import { BrandPage } from "./BrandPage.js";
import { DistributionPage } from "./DistributionPage.js";
import { AboutPage, ContactPage, LegalPage, PricingPage } from "./SitePages.js";
import { applySeo, defaultSeo } from "./seo.js";
import type { ProjectRunView } from "./types.js";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.js";
import { WhatsNewDialog } from "./WhatsNewDialog.js";
import {
  WHATS_NEW_ENTRIES,
  WHATS_NEW_STORAGE_KEY,
  entriesSince,
  readReopenEnabled,
  readStoredDate,
  storageKeyFor,
  todayStamp,
  writeReopenEnabled,
  writeStoredDate,
  type WhatsNewEntry
} from "./whatsNew.js";
import "./styles.css";

type AppView =
  | "landing"
  | "dashboard"
  | "create"
  | "run"
  | "distribution"
  | "brand"
  | "about"
  | "contact"
  | "terms"
  | "privacy"
  | "legal"
  | "pricing";

type AppLocation = {
  view: AppView;
  runId: string | null;
  fromRunId?: string | null;
};

function parseLocation(): AppLocation {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const fromRunId = new URLSearchParams(window.location.search).get("from");
  if (path.startsWith("/runs/")) {
    const id = path.slice("/runs/".length).split("/")[0] ?? "";
    if (id) return { view: "run", runId: id };
  }
  if (path === "/create") return { view: "create", runId: null, fromRunId };
  if (path === "/brand") return { view: "brand", runId: null };
  if (path.startsWith("/distribution")) return { view: "distribution", runId: fromRunId };
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
  if (loc.view === "create") return loc.fromRunId ? `/create?from=${encodeURIComponent(loc.fromRunId)}` : "/create";
  if (loc.view === "brand") return "/brand";
  if (loc.view === "distribution") {
    const run = loc.runId ? `?from=${encodeURIComponent(loc.runId)}` : "";
    return `/distribution${run}`;
  }
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
  const [fromRunId, setFromRunId] = useState<string | null>(initial.fromRunId ?? null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewSinceVisit, setWhatsNewSinceVisit] = useState(false);
  const [whatsNewEntries, setWhatsNewEntries] = useState<WhatsNewEntry[]>([]);
  const [showWhatsNewReopen, setShowWhatsNewReopen] = useState(false);

  const navigate = useCallback((next: AppLocation, mode: "push" | "replace" = "push") => {
    setView(next.view);
    setRunId(next.runId);
    setFromRunId(next.fromRunId ?? null);
    const path = pathFor({ ...next, fromRunId: next.fromRunId ?? null });
    const current = `${window.location.pathname}${window.location.search}`;
    if (path !== current) {
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
        setFromRunId(state.fromRunId ?? null);
        return;
      }
      const loc = parseLocation();
      setView(loc.view);
      setRunId(loc.runId);
      setFromRunId(loc.fromRunId ?? null);
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
    if (!user) {
      setWhatsNewOpen(false);
      return;
    }
    setShowWhatsNewReopen(readReopenEnabled(user.id));
    const unseen = entriesSince(readStoredDate(storageKeyFor(WHATS_NEW_STORAGE_KEY, user.id)));
    if (unseen.length === 0) return;
    setWhatsNewEntries(unseen);
    setWhatsNewSinceVisit(true);
    setWhatsNewOpen(true);
  }, [user?.id]);

  const closeWhatsNew = useCallback(() => {
    if (user) {
      writeStoredDate(storageKeyFor(WHATS_NEW_STORAGE_KEY, user.id), todayStamp());
      writeReopenEnabled(user.id);
    }
    setShowWhatsNewReopen(true);
    setWhatsNewOpen(false);
  }, [user]);

  const openWhatsNew = useCallback(() => {
    setWhatsNewEntries(WHATS_NEW_ENTRIES);
    setWhatsNewSinceVisit(false);
    setWhatsNewOpen(true);
  }, []);

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
            aria-label={t("shell.myVideos")}
            onClick={() => navigate({ view: "dashboard", runId: null })}
          >
            <span className="nav-icon" aria-hidden>▦</span>
            <span className="nav-label">{t("shell.myVideos")}</span>
          </button>
          <button
            type="button"
            className={appView === "create" ? "nav-active" : ""}
            disabled={!user.canCreateVideo}
            aria-label={t("shell.newCreation")}
            onClick={() => navigate({ view: "create", runId: null })}
          >
            <span className="nav-icon" aria-hidden>＋</span>
            <span className="nav-label">{t("shell.newCreation")}</span>
          </button>
          <button
            type="button"
            className={appView === "brand" ? "nav-active" : ""}
            aria-label={t("shell.brand")}
            onClick={() => navigate({ view: "brand", runId: null })}
          >
            <span className="nav-icon" aria-hidden>◆</span>
            <span className="nav-label">{t("shell.brand")}</span>
          </button>
        </nav>
        <div className="header-user">
          {showWhatsNewReopen ? (
            <button
              type="button"
              className="whats-new-reopen"
              onClick={openWhatsNew}
              title={t("whatsNew.reopen")}
              aria-label={t("whatsNew.reopen")}
            >
              <span aria-hidden>✦</span>
            </button>
          ) : null}
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
            onRemixRun={(id) => {
              if (user.canCreateVideo) navigate({ view: "create", runId: null, fromRunId: id });
            }}
          />
        )}
        {appView === "create" && (
          <CreateVideoForm
            key={fromRunId ?? "new"}
            sourceRunId={fromRunId}
            onCreated={(run: ProjectRunView) => navigate({ view: "run", runId: run.id })}
            onCancel={() => navigate({ view: "dashboard", runId: null })}
          />
        )}
        {appView === "run" && runId ? (
          <RunView
            runId={runId}
            onBack={() => navigate({ view: "dashboard", runId: null })}
            onRemix={() => {
              if (user.canCreateVideo) navigate({ view: "create", runId: null, fromRunId: runId });
            }}
            canRemix={user.canCreateVideo}
            canDistribute={user.role === "ADMIN"}
            onDistribute={() => navigate({ view: "distribution", runId: runId })}
            onOpenRun={(id) => navigate({ view: "run", runId: id })}
          />
        ) : null}
        {appView === "brand" ? <BrandPage /> : null}
        {appView === "distribution" && user.role === "ADMIN" ? <DistributionPage sourceRunId={runId} /> : null}
      </main>
      <WhatsNewDialog
        open={whatsNewOpen}
        entries={whatsNewEntries}
        sinceLastVisit={whatsNewSinceVisit}
        onClose={closeWhatsNew}
      />
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
