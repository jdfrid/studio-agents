import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BRAND_TEMPLATE_STARTERS,
  applyBrandVariation,
  normalizeHexColor,
  type BrandTemplateView,
  type BrandTemplateWrite,
  type CreativeOptions,
  type Locale,
  type VariationMode
} from "@studio/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "./api.js";
import { useAuth } from "./AuthContext.js";

type Props = {
  locale: Locale;
  selectedId: string | null;
  branding: {
    businessName: string;
    slogan: string;
    websiteUrl: string;
    primaryColor: string;
    secondaryColor: string;
  };
  creative: CreativeOptions;
  durationSeconds: number;
  platform: string;
  logoFile: File | null;
  onApply: (template: BrandTemplateView, creative: CreativeOptions) => void;
  onClear: () => void;
  onHydrateLogo?: (template: BrandTemplateView) => void;
};

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function joinLines(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

function starterView(starter: (typeof BRAND_TEMPLATE_STARTERS)[number], locale: Locale): BrandTemplateView {
  const name = locale === "he" ? starter.draft.nameHe : starter.draft.nameEn;
  return {
    id: "",
    name,
    businessName: null,
    slogan: null,
    websiteUrl: null,
    primaryColor: starter.draft.primaryColor,
    secondaryColor: starter.draft.secondaryColor,
    messages: starter.draft.messages ?? [],
    mustSay: starter.draft.mustSay ?? [],
    mustAvoid: starter.draft.mustAvoid ?? [],
    filmTemplate: starter.draft.filmTemplate,
    durationSeconds: starter.draft.durationSeconds,
    platform: starter.draft.platform,
    variationPolicy: starter.draft.variationPolicy ?? { music: "vary", voice: "vary", visual: "vary" },
    defaultCreative: starter.draft.defaultCreative,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function BrandTemplatePanel({
  locale,
  selectedId,
  branding,
  creative,
  durationSeconds,
  platform,
  logoFile,
  onApply,
  onClear,
  onHydrateLogo
}: Props) {
  const { t } = useTranslation("createVideo");
  const { user } = useAuth();
  const [templates, setTemplates] = useState<BrandTemplateView[]>([]);
  const [loadError, setLoadError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [messages, setMessages] = useState("");
  const [mustSay, setMustSay] = useState("");
  const [mustAvoid, setMustAvoid] = useState("");
  const [music, setMusic] = useState<VariationMode>("vary");
  const [voice, setVoice] = useState<VariationMode>("vary");
  const [visual, setVisual] = useState<VariationMode>("vary");

  async function refresh() {
    if (!user) return;
    try {
      const data = await apiGet<{ templates: BrandTemplateView[] }>("/brand-templates");
      setTemplates(data.templates);
      setLoadError("");
    } catch (err) {
      setLoadError((err as Error).message || t("branding.templates.loadError"));
    }
  }

  const hydrateRef = useRef(onHydrateLogo);
  hydrateRef.current = onHydrateLogo;

  useEffect(() => {
    void refresh();
    // Load once per signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) return;
    const found = templates.find((item) => item.id === selectedId);
    if (found) hydrateRef.current?.(found);
  }, [templates, selectedId]);

  function fillEditor(template: BrandTemplateView) {
    setEditingId(template.id || null);
    setName(template.name);
    setMessages(joinLines(template.messages));
    setMustSay(joinLines(template.mustSay));
    setMustAvoid(joinLines(template.mustAvoid));
    setMusic(template.variationPolicy.music);
    setVoice(template.variationPolicy.voice);
    setVisual(template.variationPolicy.visual);
  }

  function applyTemplate(template: BrandTemplateView) {
    fillEditor(template);
    onApply(template, applyBrandVariation(template));
  }

  async function save() {
    if (!user) {
      setError(t("branding.templates.signIn"));
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError(t("branding.templates.name"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body: BrandTemplateWrite = {
        name: trimmedName,
        businessName: branding.businessName.trim() || null,
        slogan: branding.slogan.trim() || null,
        websiteUrl: branding.websiteUrl.trim() || null,
        primaryColor: normalizeHexColor(branding.primaryColor) ?? null,
        secondaryColor: normalizeHexColor(branding.secondaryColor) ?? null,
        messages: lines(messages),
        mustSay: lines(mustSay),
        mustAvoid: lines(mustAvoid),
        filmTemplate: creative.filmTemplate ?? null,
        durationSeconds,
        platform,
        variationPolicy: { music, voice, visual },
        defaultCreative: {
          ...(creative.filmTemplate ? { filmTemplate: creative.filmTemplate } : {}),
          ...(creative.musicTempo ? { musicTempo: creative.musicTempo } : {}),
          ...(creative.voiceCharacter ? { voiceCharacter: creative.voiceCharacter } : {}),
          ...(creative.voiceGender ? { voiceGender: creative.voiceGender } : {}),
          ...(creative.designStyle ? { designStyle: creative.designStyle } : {}),
          ...(creative.colorPalette ? { colorPalette: creative.colorPalette } : {})
        }
      };
      if (logoFile) {
        body.logoDataUrl = await fileToDataUrl(logoFile);
        body.logoName = logoFile.name;
        body.logoMimeType = logoFile.type || "image/png";
      }
      const result = editingId
        ? await apiPut<{ template: BrandTemplateView }>(`/brand-templates/${editingId}`, body)
        : await apiPost<{ template: BrandTemplateView }>("/brand-templates", body);
      setTemplates((current) => {
        const next = current.filter((item) => item.id !== result.template.id);
        return [result.template, ...next];
      });
      setEditingId(result.template.id);
      applyTemplate(result.template);
    } catch (err) {
      setError((err as Error).message || t("branding.templates.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editingId || !user) return;
    if (!window.confirm(t("branding.templates.confirmDelete"))) return;
    setBusy(true);
    setError("");
    try {
      await apiDelete(`/brand-templates/${editingId}`);
      setTemplates((current) => current.filter((item) => item.id !== editingId));
      if (selectedId === editingId) onClear();
      setEditingId(null);
      setName("");
      setEditorOpen(false);
    } catch (err) {
      setError((err as Error).message || t("branding.templates.saveError"));
    } finally {
      setBusy(false);
    }
  }

  const selected = templates.find((item) => item.id === selectedId);

  return (
    <div className="brand-template-panel">
      <div className="brand-template-panel-head">
        <h3>{t("branding.templates.heading")}</h3>
        <p className="muted">{t("branding.templates.help")}</p>
      </div>

      <p className="brand-template-label">{t("branding.templates.starters")}</p>
      <div className="brand-template-cards">
        {BRAND_TEMPLATE_STARTERS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            className="brand-template-card"
            onClick={() => applyTemplate(starterView(starter, locale))}
          >
            <strong>{locale === "he" ? starter.nameHe : starter.nameEn}</strong>
            <small>{locale === "he" ? starter.helpHe : starter.helpEn}</small>
          </button>
        ))}
      </div>

      <p className="brand-template-label">{t("branding.templates.saved")}</p>
      {loadError ? <p className="error-inline">{loadError}</p> : null}
      {!user ? <p className="muted">{t("branding.templates.signIn")}</p> : null}
      {user && templates.length === 0 && !loadError ? (
        <p className="muted">{t("branding.templates.empty")}</p>
      ) : null}
      {templates.length ? (
        <div className="brand-template-cards brand-template-saved">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`brand-template-card${selectedId === template.id ? " is-selected" : ""}`}
              onClick={() => applyTemplate(template)}
            >
              <strong>{template.name}</strong>
              <small>{template.businessName || template.websiteUrl || t("branding.templates.apply")}</small>
            </button>
          ))}
        </div>
      ) : null}

      {selected || selectedId ? (
        <p className="brand-template-using">
          {t("branding.templates.using", { name: selected?.name || name || t("branding.heading") })}
          <button type="button" className="link-btn" onClick={onClear}>
            {t("branding.templates.clear")}
          </button>
        </p>
      ) : null}

      <div className="brand-template-editor-actions">
        <button type="button" className="button-secondary" onClick={() => setEditorOpen((open) => !open)}>
          {editorOpen ? t("branding.templates.edit") : selectedId ? t("branding.templates.edit") : t("branding.templates.new")}
        </button>
      </div>

      {editorOpen ? (
        <div className="brand-template-editor">
          <label>
            {t("branding.templates.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label>
            {t("branding.templates.messages")}
            <textarea value={messages} onChange={(e) => setMessages(e.target.value)} rows={4} maxLength={1600} />
            <small className="muted">{t("branding.templates.messagesHelp")}</small>
          </label>
          <label>
            {t("branding.templates.mustSay")}
            <textarea value={mustSay} onChange={(e) => setMustSay(e.target.value)} rows={3} maxLength={1600} />
          </label>
          <label>
            {t("branding.templates.mustAvoid")}
            <textarea value={mustAvoid} onChange={(e) => setMustAvoid(e.target.value)} rows={3} maxLength={1600} />
          </label>
          <fieldset className="brand-template-variation">
            <legend>{t("branding.templates.variation")}</legend>
            <VariationRow label={t("branding.templates.music")} value={music} onChange={setMusic} t={t} />
            <VariationRow label={t("branding.templates.voice")} value={voice} onChange={setVoice} t={t} />
            <VariationRow label={t("branding.templates.visual")} value={visual} onChange={setVisual} t={t} />
          </fieldset>
          {error ? <p className="error-inline">{error}</p> : null}
          <div className="brand-template-save-row">
            <button type="button" className="primary" disabled={busy || !user} onClick={() => void save()}>
              {busy ? t("branding.templates.saving") : t("branding.templates.save")}
            </button>
            {editingId ? (
              <button type="button" className="link-btn" disabled={busy} onClick={() => void remove()}>
                {t("branding.templates.delete")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VariationRow({
  label,
  value,
  onChange,
  t
}: {
  label: string;
  value: VariationMode;
  onChange: (value: VariationMode) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="brand-template-variation-row">
      <span>{label}</span>
      <label>
        <input type="radio" checked={value === "vary"} onChange={() => onChange("vary")} />
        {t("branding.templates.vary")}
      </label>
      <label>
        <input type="radio" checked={value === "lock"} onChange={() => onChange("lock")} />
        {t("branding.templates.lock")}
      </label>
    </div>
  );
}
