import { useEffect, useMemo, useState } from "react";
import { apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
import type { ProjectRunView } from "./types.js";
import {
  CREATIVE_FIELD_SECTIONS,
  aspectRatioFromCreative,
  languageCodeFromCreative,
  type ApprovalMode,
  type CreativeOptions
} from "@studio/shared";

export function CreateVideoForm({ onCreated, onCancel }: { onCreated: (run: ProjectRunView) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const canCreate = user?.canCreateVideo ?? false;
  const freeLeft = user?.freeVideosRemaining ?? 0;
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("auto");
  const [visualFiles, setVisualFiles] = useState<File[]>([]);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [insertFile, setInsertFile] = useState<File | null>(null);
  const [insertAtSeconds, setInsertAtSeconds] = useState(8);
  const [insertAudioSource, setInsertAudioSource] = useState<"clip" | "narration">("clip");
  const [businessName, setBusinessName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [creative, setCreative] = useState<CreativeOptions>({
    karaokeCaptions: "on",
    preferHeygenDub: "off"
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preferHeygenDub = creative.preferHeygenDub === "on";
  const heygenNeedsAnchor = preferHeygenDub && visualFiles.length === 0;

  const MAX_VOICE_BYTES = 10 * 1024 * 1024;
  const MAX_INSERT_BYTES = 40 * 1024 * 1024;
  const MAX_LOGO_BYTES = 5 * 1024 * 1024;
  const MAX_VISUAL_FILES = 8;
  const MAX_VISUAL_BYTES = 5 * 1024 * 1024;

  const logoPreviewUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  const visualPreviewUrls = useMemo(
    () => visualFiles.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [visualFiles]
  );
  useEffect(() => {
    return () => {
      for (const item of visualPreviewUrls) URL.revokeObjectURL(item.url);
    };
  }, [visualPreviewUrls]);

  const previewAspect = aspectRatioFromCreative(creative) ?? "9:16";
  const showBrandingPreview = Boolean(businessName.trim() || slogan.trim() || websiteUrl.trim() || logoFile);

  function addVisualFiles(incoming: FileList | File[]) {
    const next = [...visualFiles];
    for (const file of Array.from(incoming)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_VISUAL_BYTES) {
        setError(`תמונת דמות גדולה מדי (מקסימום 5MB): ${file.name}`);
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
        continue;
      }
      if (next.length >= MAX_VISUAL_FILES) {
        setError(`ניתן להעלות עד ${MAX_VISUAL_FILES} תמונות דמויות.`);
        break;
      }
      next.push(file);
    }
    setVisualFiles(next);
  }

  function removeVisualFile(index: number) {
    setVisualFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function setCreativeField<K extends keyof CreativeOptions>(key: K, value: CreativeOptions[K] | "") {
    setCreative((prev) => {
      const next = { ...prev };
      if (value === "" || value == null) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  async function submit() {
    if (!canCreate) {
      setError("אין מספיק קרדיטים ליצירת סרטון. רכוש קרדיטים או השתמש בסרטון החינמי מהדשבורד.");
      return;
    }
    if (!title.trim() || !prompt.trim()) return;
    if (voiceFile && !voiceConsent) {
      setError("יש לאשר שיש לך זכות להשתמש בקול לפני שיבוט.");
      return;
    }
    if (voiceFile && voiceFile.size > MAX_VOICE_BYTES) {
      setError("קובץ הקול גדול מדי (מקסימום 10MB).");
      return;
    }
    if (insertFile && insertFile.size > MAX_INSERT_BYTES) {
      setError("סרטון השילוב גדול מדי (מקסימום 40MB).");
      return;
    }
    if (logoFile && logoFile.size > MAX_LOGO_BYTES) {
      setError("קובץ הלוגו גדול מדי (מקסימום 5MB).");
      return;
    }
    if (preferHeygenDub && visualFiles.length === 0) {
      setError("לדיבוב HeyGen נדרשת לפחות תמונת דמות אחת.");
      return;
    }
    if (visualFiles.length > MAX_VISUAL_FILES) {
      setError(`ניתן להעלות עד ${MAX_VISUAL_FILES} תמונות דמויות.`);
      return;
    }
    if (visualFiles.some((f) => f.size > MAX_VISUAL_BYTES)) {
      setError("אחת מתמונות הדמויות גדולה מדי (מקסימום 5MB לקובץ).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const attachments: Array<{
        name: string;
        mimeType: string;
        kind: "image" | "video" | "audio";
        role: "anchor" | "voice_clone" | "insert_clip" | "logo";
        dataUrl: string;
        insertAtSeconds?: number;
        audioSource?: "clip" | "narration";
      }> = await Promise.all(
        visualFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || "image/png",
          kind: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
          role: "anchor" as const,
          dataUrl: await fileToDataUrl(file)
        }))
      );
      if (voiceFile) {
        attachments.push({
          name: voiceFile.name,
          mimeType: voiceFile.type || "audio/mpeg",
          kind: "audio",
          role: "voice_clone",
          dataUrl: await fileToDataUrl(voiceFile)
        });
      }
      if (insertFile) {
        attachments.push({
          name: insertFile.name,
          mimeType: insertFile.type || "video/mp4",
          kind: "video",
          role: "insert_clip",
          dataUrl: await fileToDataUrl(insertFile),
          insertAtSeconds: Math.max(0, insertAtSeconds),
          audioSource: insertAudioSource
        });
      }
      if (logoFile) {
        attachments.push({
          name: logoFile.name,
          mimeType: logoFile.type || "image/png",
          kind: "image",
          role: "logo",
          dataUrl: await fileToDataUrl(logoFile)
        });
      }
      const creativePayload = Object.keys(creative).length > 0 ? creative : undefined;
      const brandingPayload =
        businessName.trim() || slogan.trim() || websiteUrl.trim()
          ? {
              ...(businessName.trim() ? { businessName: businessName.trim() } : {}),
              ...(slogan.trim() ? { slogan: slogan.trim() } : {}),
              ...(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {})
            }
          : undefined;
      const run = await apiPost<ProjectRunView>("/runs", {
        brief: {
          title,
          sourceText: prompt,
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
          language: languageCodeFromCreative(creative) ?? "he",
          durationSeconds,
          aspectRatio: aspectRatioFromCreative(creative) ?? "9:16",
          budgetMode: true,
          approvalMode,
          attachments,
          ...(creativePayload ? { creative: creativePayload } : {}),
          ...(brandingPayload ? { branding: brandingPayload } : {})
        }
      });
      onCreated(run);
    } catch (err) {
      const e = err as Error & { code?: string };
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="create-form">
      <h2>סרטון חדש</h2>
      {freeLeft > 0 ? (
        <p className="billing-banner-free create-free-note">
          {freeLeft === 1
            ? "סרטון חינם — לא יגבה קרדיט מהיתרה שלך."
            : `סרטון חינם (${freeLeft} נותרו) — לא יגבה קרדיט מהיתרה שלך.`}
        </p>
      ) : null}
      <label>
        כותרת
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם הסרטון" />
      </label>
      <label>
        מה תרצה לראות בסרטון?
        <textarea
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="תאר את הסרטון — דמויות, מקום, פעולה, סגנון…"
        />
      </label>
      <label>
        הוראות (אופציונלי)
        <textarea
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="מה כן / מה לא — למשל: לא לשנות מדים רשמיים מהתמונה; כן לשנות רקע; תקריב הלוך ושוב לפנים…"
        />
        <small className="muted">הנחיות מחייבות ליצירה — מה לשמור, מה לשנות, תנועות מצלמה וכו׳.</small>
      </label>
      <label className="file-row">
        תמונות דמויות / רקע (אופציונלי)
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) addVisualFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <small className="muted">
          עד {MAX_VISUAL_FILES} תמונות — תמונה 1 = דמות א׳, תמונה 2 = דמות ב׳. הן ישמשו כזהות הפנים בסרטון (לא רק השראה כללית).
        </small>
      </label>
      {visualFiles.length ? (
        <ul className="visual-files-list">
          {visualPreviewUrls.map((item, index) => (
            <li key={`${item.name}-${index}`} className="visual-file-item">
              <img src={item.url} alt="" className="visual-file-thumb" />
              <span className="visual-file-name" title={item.name}>
                {item.name}
              </span>
              <button type="button" className="link-btn" onClick={() => removeVisualFile(index)}>
                הסר
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="file-row">
        שיבוט קול (אופציונלי)
        <input
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,.mp3,.wav,.m4a"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setVoiceFile(file);
            if (!file) setVoiceConsent(false);
          }}
        />
        <small className="muted">
          דגימה ברורה של כ־30–120 שניות, בלי רעש רקע. הדיבוב בסרטון יוקרא בקול הזה.
        </small>
      </label>
      {voiceFile ? (
        <label className="consent-row">
          <input type="checkbox" checked={voiceConsent} onChange={(e) => setVoiceConsent(e.target.checked)} />
          יש לי זכות להשתמש בקול הזה לשיבוט
        </label>
      ) : null}
      <label className="file-row">
        שילוב סרטון קצר (אופציונלי)
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
          onChange={(e) => setInsertFile(e.target.files?.[0] ?? null)}
        />
        <small className="muted">קטע של כמה שניות שיושתל בתוך הסרטון עם מעבר חלק.</small>
      </label>
      {insertFile ? (
        <div className="insert-clip-options">
          <label>
            מיקום פריצה (שניות מתחילת הסרטון)
            <input
              type="number"
              min={0}
              max={Math.max(0, durationSeconds - 1)}
              step={0.5}
              value={insertAtSeconds}
              onChange={(e) => setInsertAtSeconds(Number(e.target.value) || 0)}
            />
          </label>
          <fieldset className="approval-fieldset">
            <legend>קול בסרטון המשולב</legend>
            <label>
              <input
                type="radio"
                checked={insertAudioSource === "clip"}
                onChange={() => setInsertAudioSource("clip")}
              />
              מהסרטון המקורי
            </label>
            <label>
              <input
                type="radio"
                checked={insertAudioSource === "narration"}
                onChange={() => setInsertAudioSource("narration")}
              />
              בלי קול מהמקור (רק הקריינות שלנו סביב)
            </label>
          </fieldset>
        </div>
      ) : null}
      <label>
        משך (שניות)
        <input
          type="number"
          min={5}
          max={60}
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(Number(e.target.value) || 30)}
        />
        <small className="muted">האורך הסופי מעוגל לפי מנוע הווידאו (למשל קטעים של 5–8 שניות) — בחר 30 או 60 אם אתה רוצה סרטון ארוך יותר.</small>
      </label>
      <fieldset className="approval-fieldset">
        <legend>מצב יצירה</legend>
        <label>
          <input type="radio" checked={approvalMode === "auto"} onChange={() => setApprovalMode("auto")} />
          הרץ הכל אוטומטית
        </label>
        <label>
          <input
            type="radio"
            checked={approvalMode === "auto_until_render"}
            onChange={() => setApprovalMode("auto_until_render")}
          />
          עצור לפני הסרטון הסופי
        </label>
        <label>
          <input type="radio" checked={approvalMode === "manual"} onChange={() => setApprovalMode("manual")} />
          המתן לאישור בכל שלב
        </label>
      </fieldset>

      <section className="branding-section" aria-label="מיתוג העסק">
        <h3 className="branding-section-title">מיתוג העסק</h3>
        <p className="muted branding-hint">יופיע בכרטיס הסיום — שם, סלוגן, קישור ולוגו, עם דיבוב קצר למותג.</p>
        <label>
          שם העסק
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="למשל: קפה הבוקר"
            maxLength={120}
          />
        </label>
        <label>
          סלוגן
          <input
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder="משפט קצר שמלווה את המותג"
            maxLength={200}
          />
        </label>
        <label>
          קישור לאתר / דף נחיתה
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            maxLength={300}
            inputMode="url"
          />
        </label>
        <label className="file-row">
          לוגו
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
          <small className="muted">תמונה שקופה או רקע כהה עובדת הכי טוב בכרטיס הסיום.</small>
        </label>
        {showBrandingPreview ? (
          <div
            className={`branding-preview branding-preview-${previewAspect === "16:9" ? "landscape" : "portrait"}`}
            aria-live="polite"
          >
            <div className="branding-preview-inner">
              {logoPreviewUrl ? (
                <img src={logoPreviewUrl} alt="" className="branding-preview-logo" />
              ) : (
                <div className="branding-preview-logo-placeholder" aria-hidden />
              )}
              {businessName.trim() ? <p className="branding-preview-name">{businessName.trim()}</p> : null}
              {slogan.trim() ? <p className="branding-preview-slogan">{slogan.trim()}</p> : null}
              {websiteUrl.trim() ? (
                <p className="branding-preview-url">{websiteUrl.trim().replace(/^https?:\/\//i, "")}</p>
              ) : null}
              <p className="branding-preview-credit">prompt2spot.com</p>
            </div>
          </div>
        ) : null}
      </section>

      <button
        type="button"
        className="advanced-toggle"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        <span className={`advanced-chevron ${advancedOpen ? "open" : ""}`} aria-hidden>
          ▾
        </span>
        מתקדם
      </button>
      {advancedOpen ? (
        <div className="advanced-panel">
          <p className="muted advanced-hint">שדות אופציונליים — מחולקים לפי שלבי יצירת הסרטון.</p>
          <div className="advanced-presets">
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setCreative((prev) => ({
                  ...prev,
                  designStyle: "סגנון פיקסאר",
                  communicationStyle: "חדשותי",
                  location: "אולפן חדשות",
                  karaokeCaptions: "on",
                  preferHeygenDub: "off",
                  sideWatermark: "on",
                  videoOrientation: "portrait"
                }))
              }
            >
              סגנון STORYZ (פיקסאר + דיבוב)
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setCreative((prev) => ({
                  ...prev,
                  designStyle: "חדשות אולפן",
                  communicationStyle: "חדשותי",
                  location: "אולפן חדשות",
                  karaokeCaptions: "on",
                  preferHeygenDub: "off",
                  sideWatermark: "on",
                  videoOrientation: "portrait"
                }))
              }
            >
              סגנון חדשות אולפן
            </button>
          </div>
          <div className={`heygen-dub-control ${preferHeygenDub ? "heygen-dub-control--on" : ""}`}>
            <div className="heygen-dub-control-row">
              <label className="heygen-dub-label">
                תנועות שפתיים (HeyGen)
                <select
                  value={String(creative.preferHeygenDub ?? "off")}
                  onChange={(e) =>
                    setCreativeField("preferHeygenDub", (e.target.value || "off") as never)
                  }
                >
                  <option value="off">לא — וידאו + דיבוב (כלול בתשלום שלך)</option>
                  <option value="on">כן — סנכרון שפתיים HeyGen (חיוב נפרד ב־HeyGen)</option>
                </select>
              </label>
              {preferHeygenDub ? (
                <button
                  type="button"
                  className="heygen-dub-off-btn"
                  onClick={() => setCreativeField("preferHeygenDub", "off")}
                >
                  כבה סנכרון שפתיים
                </button>
              ) : null}
            </div>
            {preferHeygenDub ? (
              <p className={`advanced-hint ${heygenNeedsAnchor ? "error-inline" : "muted"}`}>
                דורש קרדיטים בחשבון HeyGen בנפרד מתשלום Prompt2Spot. חובה תמונת דמות.
              </p>
            ) : (
              <p className="muted advanced-hint">
                ברירת מחדל: דיבוב TTS על וידאו (Veo/Wan) — נכלל במנוי/קרדיטים של Prompt2Spot. בלי חיוב HeyGen.
              </p>
            )}
          </div>
          {CREATIVE_FIELD_SECTIONS.map((section) => (
            <div key={section.id} className="advanced-section">
              <h4 className="advanced-section-title">{section.titleHe}</h4>
              <div className="advanced-grid">
                {section.fields
                  .filter((field) => field.key !== "preferHeygenDub")
                  .map((field) => (
                  <label key={field.key}>
                    {field.labelHe}
                    {field.kind === "number" ? (
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        value={creative[field.key] == null ? "" : String(creative[field.key])}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (!raw) {
                            setCreativeField(field.key, "");
                            return;
                          }
                          setCreativeField(field.key, Number(raw) as never);
                        }}
                        placeholder={field.unit ? `${field.min}–${field.max} ${field.unit}` : undefined}
                      />
                    ) : (
                      <select
                        value={String(creative[field.key] ?? "")}
                        onChange={(e) => setCreativeField(field.key, (e.target.value || "") as never)}
                      >
                        <option value="">— בחירה —</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.labelHe}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="error-inline">{error}</p> : null}
      <div className="stage-actions">
        <button
          type="button"
          className="primary"
          disabled={
            busy ||
            !canCreate ||
            !title.trim() ||
            !prompt.trim() ||
            (!!voiceFile && !voiceConsent) ||
            heygenNeedsAnchor
          }
          onClick={() => void submit()}
        >
          {busy ? "יוצר…" : "התחל יצירה"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}