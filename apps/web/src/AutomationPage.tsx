import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPatch, apiPost, apiPut } from "./api.js";
import type { AutomationCampaignView, AutomationJobView, AutomationProductView, BrandTemplateView } from "@studio/shared";

export function AutomationPage({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const { t } = useTranslation();
  const [campaign, setCampaign] = useState<AutomationCampaignView | null>(null);
  const [templates, setTemplates] = useState<BrandTemplateView[]>([]);
  const [products, setProducts] = useState<AutomationProductView[]>([]);
  const [jobs, setJobs] = useState<AutomationJobView[]>([]);
  const [brandTemplateId, setBrandTemplateId] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [hourLocal, setHourLocal] = useState(9);
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [enabled, setEnabled] = useState(false);
  const [extraUrls, setExtraUrls] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [{ campaign: next }, { templates: kits }] = await Promise.all([
      apiGet<{ campaign: AutomationCampaignView | null }>("/automation/campaign"),
      apiGet<{ templates: BrandTemplateView[] }>("/brand-templates")
    ]);
    setCampaign(next);
    setTemplates(kits);
    if (next) {
      setBrandTemplateId(next.brandTemplateId);
      setWebsiteUrl(next.websiteUrl);
      setBusinessName(next.businessName ?? "");
      setSlogan(next.slogan ?? "");
      setHourLocal(next.hourLocal);
      setTimezone(next.timezone);
      setEnabled(next.enabled);
      const [{ products: catalog }, { jobs: log }] = await Promise.all([
        apiGet<{ products: AutomationProductView[] }>("/automation/campaign/products"),
        apiGet<{ jobs: AutomationJobView[] }>("/automation/campaign/jobs")
      ]);
      setProducts(catalog);
      setJobs(log);
    } else {
      setProducts([]);
      setJobs([]);
    }
    return next;
  }, []);

  useEffect(() => {
    void load().catch((err) => setError((err as Error).message));
  }, [load]);

  useEffect(() => {
    const busyJob = jobs.some((job) => job.status === "queued" || job.status === "scraping" || job.status === "producing");
    const scanning = campaign?.status === "running";
    if (!busyJob && !scanning) return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [jobs, campaign?.status, load]);

  async function save() {
    setBusy("save");
    setError("");
    try {
      const { campaign: next } = await apiPut<{ campaign: AutomationCampaignView }>("/automation/campaign", {
        websiteUrl,
        businessName: businessName || undefined,
        slogan: slogan || null,
        hourLocal,
        timezone,
        enabled,
        ...(brandTemplateId ? { brandTemplateId } : {})
      });
      setCampaign(next);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function scan() {
    setBusy("scan");
    setError("");
    try {
      await apiPost("/automation/campaign/scan");
      for (let i = 0; i < 25; i++) {
        const next = await load();
        if (!next || next.status !== "running") break;
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addUrls() {
    const urls = extraUrls
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!urls.length) return;
    setBusy("urls");
    setError("");
    try {
      await apiPost("/automation/campaign/urls", { urls });
      setExtraUrls("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runToday() {
    setBusy("run");
    setError("");
    try {
      await apiPost("/automation/campaign/run-today");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleEnabled(next: boolean) {
    setEnabled(next);
    if (!campaign) return;
    try {
      await apiPatch("/automation/campaign", { enabled: next });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="brand-page automation-page">
      <header className="page-heading">
        <p className="eyebrow">{t("automationPage.eyebrow")}</p>
        <h1>{t("automationPage.title")}</h1>
        <p className="muted">{t("automationPage.description")}</p>
      </header>

      <section className="create-topic-card">
        <label className="field-block">
          {t("automationPage.brandKit")}
          <select value={brandTemplateId} onChange={(e) => setBrandTemplateId(e.target.value)}>
            <option value="">{t("automationPage.brandKitNew")}</option>
            {templates.map((kit) => (
              <option key={kit.id} value={kit.id}>
                {kit.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          {t("automationPage.brandHint")}{" "}
          <a href="/brand">{t("automationPage.brandLink")}</a>
        </p>
        <label className="field-block">
          {t("automationPage.businessName")}
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={120} />
        </label>
        <label className="field-block">
          {t("automationPage.slogan")}
          <input value={slogan} onChange={(e) => setSlogan(e.target.value)} maxLength={200} />
        </label>
        <label className="field-block">
          {t("automationPage.website")}
          <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} maxLength={300} />
        </label>
        <div className="automation-row">
          <label className="field-block">
            {t("automationPage.hour")}
            <input
              type="number"
              min={0}
              max={23}
              value={hourLocal}
              onChange={(e) => setHourLocal(Number(e.target.value))}
            />
          </label>
          <label className="field-block">
            {t("automationPage.timezone")}
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} maxLength={60} />
          </label>
        </div>
        {campaign ? (
          <label className="check-row">
            <input type="checkbox" checked={enabled} onChange={(e) => void toggleEnabled(e.target.checked)} />
            {t("automationPage.enabled")}
            <span className="muted">{t(`automationPage.status.${campaign.status}`)}</span>
          </label>
        ) : null}
        <p className="muted">{t("automationPage.holdNote")}</p>
        {error ? <p className="error-inline">{error}</p> : null}
        {campaign?.lastError ? (
          <p className="error-inline">
            {t(`automationPage.errors.${campaign.lastError}`, { defaultValue: campaign.lastError })}
          </p>
        ) : null}
        <div className="stage-actions">
          <button type="button" className="primary" disabled={Boolean(busy) || !websiteUrl.trim()} onClick={() => void save()}>
            {busy === "save" ? t("automationPage.saving") : t("automationPage.save")}
          </button>
          <button type="button" className="button-secondary" disabled={!campaign || Boolean(busy)} onClick={() => void scan()}>
            {busy === "scan" ? t("automationPage.scanning") : t("automationPage.scan")}
          </button>
          <button type="button" className="button-secondary" disabled={!campaign || Boolean(busy)} onClick={() => void runToday()}>
            {busy === "run" ? t("automationPage.running") : t("automationPage.runToday")}
          </button>
        </div>
      </section>

      {campaign ? (
        <section className="create-topic-card">
          <label className="field-block">
            {t("automationPage.extraUrls")}
            <textarea rows={4} value={extraUrls} onChange={(e) => setExtraUrls(e.target.value)} />
          </label>
          <button type="button" className="button-secondary" disabled={Boolean(busy)} onClick={() => void addUrls()}>
            {t("automationPage.addUrls")}
          </button>
        </section>
      ) : (
        <p className="muted">{t("automationPage.noCampaign")}</p>
      )}

      <section className="create-topic-card">
        <h2>
          {t("automationPage.catalog")}{" "}
          <small className="muted">{t("automationPage.unused", { count: campaign?.unusedCount ?? 0 })}</small>
        </h2>
        {products.length === 0 ? (
          <p className="muted">{t("automationPage.noProducts")}</p>
        ) : (
          <ul className="automation-list">
            {products.map((product) => (
              <li key={product.id}>
                <strong>{product.title}</strong>
                {product.priceText ? <span className="muted"> · {product.priceText}</span> : null}
                {product.usedAt ? <span className="muted"> · {t("automationPage.used")}</span> : null}
                <div>
                  <a href={product.canonicalUrl} target="_blank" rel="noreferrer">
                    {product.canonicalUrl}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="create-topic-card">
        <h2>{t("automationPage.journal")}</h2>
        {jobs.length === 0 ? (
          <p className="muted">{t("automationPage.noJobs")}</p>
        ) : (
          <ul className="automation-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.productTitle}</strong>
                <span className="muted"> · {job.dayKey} · {t(`automationPage.status.${job.status}`)}</span>
                {job.error ? <p className="error-inline">{job.error}</p> : null}
                {job.runId ? (
                  <div>
                    <button type="button" className="link-btn" onClick={() => onOpenRun(job.runId!)}>
                      {t("automationPage.openRun")}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
