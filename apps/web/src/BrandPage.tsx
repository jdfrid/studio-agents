import { useState } from "react";
import { useTranslation } from "react-i18next";
import { localeFor } from "./i18n/index.js";
import { BrandTemplatePanel } from "./BrandTemplatePanel.js";
import type { BrandTemplateView, CreativeOptions } from "@studio/shared";

export function BrandPage() {
  const { t, i18n } = useTranslation();
  const { t: createT } = useTranslation("createVideo");
  const uiLocale = localeFor(i18n.resolvedLanguage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [branding, setBranding] = useState({
    businessName: "",
    slogan: "",
    websiteUrl: "",
    primaryColor: "",
    secondaryColor: ""
  });
  const [creative, setCreative] = useState<CreativeOptions>({ karaokeCaptions: "on", language: uiLocale === "he" ? "he" : "en" });
  const [logoFile, setLogoFile] = useState<File | null>(null);

  function applyTemplate(template: BrandTemplateView, nextCreative: CreativeOptions) {
    setSelectedId(template.id || null);
    setBranding({
      businessName: template.businessName ?? "",
      slogan: template.slogan ?? "",
      websiteUrl: template.websiteUrl ?? "",
      primaryColor: template.primaryColor ?? "",
      secondaryColor: template.secondaryColor ?? ""
    });
    setCreative((current) => ({ ...current, ...nextCreative }));
  }

  return (
    <div className="brand-page">
      <header className="page-heading">
        <p className="eyebrow">{t("shell.brand")}</p>
        <h1>{t("brandPage.title")}</h1>
        <p className="muted">{t("brandPage.description")}</p>
      </header>
      <section className="create-topic-card">
        <BrandTemplatePanel
          locale={uiLocale}
          selectedId={selectedId}
          branding={branding}
          creative={creative}
          durationSeconds={30}
          platform="instagram_reels"
          logoFile={logoFile}
          onApply={applyTemplate}
          onClear={() => setSelectedId(null)}
        />
        <label className="field-block">
          {createT("branding.businessName")}
          <input
            value={branding.businessName}
            onChange={(e) => setBranding((current) => ({ ...current, businessName: e.target.value }))}
            maxLength={120}
          />
        </label>
        <label className="field-block">
          {createT("branding.slogan")}
          <input
            value={branding.slogan}
            onChange={(e) => setBranding((current) => ({ ...current, slogan: e.target.value }))}
            maxLength={200}
          />
        </label>
        <label className="field-block">
          {createT("branding.website")}
          <input
            type="url"
            value={branding.websiteUrl}
            onChange={(e) => setBranding((current) => ({ ...current, websiteUrl: e.target.value }))}
            maxLength={300}
          />
        </label>
        <label className="file-row">
          {createT("branding.logo")}
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
        </label>
      </section>
    </div>
  );
}
