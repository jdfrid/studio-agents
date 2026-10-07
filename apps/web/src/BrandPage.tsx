import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { localeFor } from "./i18n/index.js";
import { BrandTemplatePanel } from "./BrandTemplatePanel.js";
import { VoicePicker } from "./VoicePreview.js";
import { contrastTextHex, normalizeHexColor, type BrandTemplateView, type CreativeOptions } from "@studio/shared";

const DEFAULT_PRIMARY = "#173D35";
const DEFAULT_SECONDARY = "#F6F7F2";

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

  const logoPreviewUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  const previewBg = normalizeHexColor(branding.secondaryColor) ?? DEFAULT_SECONDARY;
  const previewFg = contrastTextHex(previewBg);
  const previewAccent = normalizeHexColor(branding.primaryColor) ?? DEFAULT_PRIMARY;
  const previewName = branding.businessName.trim() || t("brandPage.title");

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
    <div className="create-form brand-page">
      <div className="page-heading">
        <p className="eyebrow">{t("shell.brand")}</p>
        <h1>{t("brandPage.title")}</h1>
        <p className="muted">{t("brandPage.description")}</p>
      </div>

      <div className="brand-kit-layout">
        <div className="brand-kit-main">
          <section className="create-topic-card" aria-labelledby="brand-templates-heading">
            <div className="form-section-heading">
              <span className="form-section-icon" aria-hidden>
                ◆
              </span>
              <div>
                <h2 id="brand-templates-heading">{createT("branding.templates.heading")}</h2>
                <p className="muted">{createT("branding.templates.help")}</p>
              </div>
            </div>
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
              onBrandingChange={(patch) => setBranding((current) => ({ ...current, ...patch }))}
              onCreativeChange={setCreative}
              hideHead
            />
          </section>

          <section className="create-topic-card" aria-labelledby="brand-identity-heading">
            <div className="form-section-heading">
              <span className="form-section-icon" aria-hidden>
                ✦
              </span>
              <div>
                <h2 id="brand-identity-heading">{t("brandPage.identity")}</h2>
                <p className="muted">{createT("branding.help")}</p>
              </div>
            </div>
            <label className="field-block">
              {createT("branding.businessName")}
              <input
                value={branding.businessName}
                onChange={(e) => setBranding((current) => ({ ...current, businessName: e.target.value }))}
                placeholder={createT("branding.businessPlaceholder")}
                maxLength={120}
              />
            </label>
            <label className="field-block">
              {createT("branding.slogan")}
              <input
                value={branding.slogan}
                onChange={(e) => setBranding((current) => ({ ...current, slogan: e.target.value }))}
                placeholder={createT("branding.sloganPlaceholder")}
                maxLength={200}
              />
            </label>
            <label className="field-block">
              {createT("branding.website")}
              <input
                type="url"
                value={branding.websiteUrl}
                onChange={(e) => setBranding((current) => ({ ...current, websiteUrl: e.target.value }))}
                placeholder="https://example.com"
                maxLength={300}
                inputMode="url"
              />
            </label>
            <label className="logo-upload">
              <span className="logo-upload-thumb" aria-hidden>
                {logoPreviewUrl ? (
                  <img src={logoPreviewUrl} alt="" />
                ) : (
                  <span>＋</span>
                )}
              </span>
              <span className="logo-upload-copy">
                <strong>{logoFile ? t("brandPage.changeLogo") : t("brandPage.chooseLogo")}</strong>
                <small>{logoFile ? logoFile.name : createT("branding.logoHelp")}</small>
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="common-fields-grid">
              <label className="field-block">
                {createT("branding.primaryColor")}
                <span className="brand-color-input">
                  <input
                    type="color"
                    value={normalizeHexColor(branding.primaryColor) ?? DEFAULT_PRIMARY}
                    onChange={(e) => setBranding((current) => ({ ...current, primaryColor: e.target.value.toUpperCase() }))}
                  />
                  <input
                    value={branding.primaryColor}
                    onChange={(e) => setBranding((current) => ({ ...current, primaryColor: e.target.value }))}
                    placeholder={DEFAULT_PRIMARY}
                    maxLength={7}
                    dir="ltr"
                    spellCheck={false}
                  />
                </span>
              </label>
              <label className="field-block">
                {createT("branding.secondaryColor")}
                <span className="brand-color-input">
                  <input
                    type="color"
                    value={normalizeHexColor(branding.secondaryColor) ?? DEFAULT_SECONDARY}
                    onChange={(e) =>
                      setBranding((current) => ({ ...current, secondaryColor: e.target.value.toUpperCase() }))
                    }
                  />
                  <input
                    value={branding.secondaryColor}
                    onChange={(e) => setBranding((current) => ({ ...current, secondaryColor: e.target.value }))}
                    placeholder={DEFAULT_SECONDARY}
                    maxLength={7}
                    dir="ltr"
                    spellCheck={false}
                  />
                </span>
              </label>
            </div>
            <small className="field-help">{createT("branding.colorsHelp")}</small>
          </section>

          <section className="create-topic-card" aria-labelledby="brand-voice-heading">
            <div className="form-section-heading">
              <span className="form-section-icon" aria-hidden>
                ♪
              </span>
              <div>
                <h2 id="brand-voice-heading">{createT("branding.preferredVoice")}</h2>
                <p className="muted">{createT("voice.pickHelp")}</p>
              </div>
            </div>
            <VoicePicker
              value={String(creative.voiceCharacter ?? "")}
              language={String(creative.language ?? (uiLocale === "he" ? "he" : "en"))}
              onChange={(id) => setCreative((current) => ({ ...current, voiceCharacter: id }))}
            />
          </section>
        </div>

        <aside className="brand-kit-preview">
          <p className="brand-kit-preview-label">{t("brandPage.previewTitle")}</p>
          <div
            className="branding-preview branding-preview-portrait"
            style={{ background: previewBg }}
            aria-live="polite"
            aria-label={createT("branding.previewAria")}
          >
            <div className="branding-preview-inner" style={{ color: previewFg }}>
              {logoPreviewUrl ? (
                <img
                  src={logoPreviewUrl}
                  alt={createT("branding.logoAlt", { name: previewName })}
                  className="branding-preview-logo"
                />
              ) : (
                <div className="branding-preview-logo-placeholder" aria-hidden />
              )}
              <p className="branding-preview-name">{previewName}</p>
              {branding.slogan.trim() ? <p className="branding-preview-slogan">{branding.slogan.trim()}</p> : null}
              {branding.websiteUrl.trim() ? (
                <p className="branding-preview-url" style={{ color: previewAccent }}>
                  {branding.websiteUrl.trim().replace(/^https?:\/\//i, "")}
                </p>
              ) : null}
              <p className="branding-preview-credit">reelmino.com</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
