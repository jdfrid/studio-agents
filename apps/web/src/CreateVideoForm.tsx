import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
import { useCreativeCatalog } from "./creativeCatalog.js";
import type { ProjectRunView } from "./types.js";
import {
  CREATIVE_FIELD_SECTIONS,
  aspectRatioFromCreative,
  estimateRunCost,
  formatCostNis,
  getRenderProfile,
  languageCodeFromCreative,
  predictRenderProfileId,
  profileToProductionCostConfig,
  type ApprovalMode,
  type CreativeOptions,
  type Locale
} from "@studio/shared";

const VIDEO_GOALS = ["product", "service", "brand", "social", "explainer", "event", "other"] as const;
const DESIRED_ACTIONS = ["buy", "visit_site", "submit_details", "contact", "learn", "remember_brand", "none"] as const;
const MOOD_OPTIONS = ["professional", "luxury", "emotional", "energetic", "modern", "dramatic", "calm", "other"] as const;
const LEGACY_GOALS: Record<string, (typeof VIDEO_GOALS)[number]> = {
  "פרסום מוצר": "product", "פרסום שירות": "service", "תדמית עסקית": "brand", "רשתות חברתיות": "social",
  "הסבר או הדרכה": "explainer", "הזמנה לאירוע": "event", "אחר": "other"
};
const LEGACY_ACTIONS: Record<string, (typeof DESIRED_ACTIONS)[number]> = {
  "לקנות": "buy", "להיכנס לאתר": "visit_site", "להשאיר פרטים": "submit_details", "ליצור קשר": "contact",
  "ללמוד ולהבין": "learn", "לזכור את המותג": "remember_brand", "ללא פעולה מוגדרת": "none"
};
const LEGACY_MOODS: Record<string, (typeof MOOD_OPTIONS)[number]> = {
  "מקצועי ואמין": "professional", "יוקרתי": "luxury", "מרגש": "emotional", "צעיר ואנרגטי": "energetic",
  "נקי ומודרני": "modern", "דרמטי": "dramatic", "רגוע": "calm", "אחר": "other"
};
const CONTENT_LANGUAGES = [
  ["he", "Hebrew"],
  ["en", "English"],
  ["ar", "Arabic"],
  ["ru", "Russian"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["yi", "Yiddish"]
] as const;

export function CreateVideoForm({ onCreated, onCancel }: { onCreated: (run: ProjectRunView) => void; onCancel: () => void }) {
  const { t, i18n } = useTranslation("createVideo");
  const uiLocale: Locale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "he";
  const catalog = useCreativeCatalog(uiLocale);
  const { user } = useAuth();
  const canCreate = user?.canCreateVideo ?? false;
  const freeLeft = user?.freeVideosRemaining ?? 0;
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [videoGoal, setVideoGoal] = useState("");
  const [desiredAction, setDesiredAction] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [platform, setPlatform] = useState("instagram_reels");
  const [narrationMode, setNarrationMode] = useState("voiceover");
  const [musicMode, setMusicMode] = useState("auto");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("auto_until_render");
  const [visualFiles, setVisualFiles] = useState<File[]>([]);
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(null);
  const [insertFile, setInsertFile] = useState<File | null>(null);
  const [insertAtSeconds, setInsertAtSeconds] = useState(8);
  const [insertAudioSource, setInsertAudioSource] = useState<"clip" | "narration">("clip");
  const [businessName, setBusinessName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showExclusions, setShowExclusions] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [creative, setCreative] = useState<CreativeOptions>({
    karaokeCaptions: "on",
    preferHeygenDub: "off"
  });
  const [catalogSelections, setCatalogSelections] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lipSyncRequested = narrationMode === "lip_sync" || creative.preferHeygenDub === "on";
  const heygenNeedsAnchor = lipSyncRequested && visualFiles.length === 0;
  const contentLocale = languageCodeFromCreative(creative) === "en" ? "en" : "he";
  const contentT = i18n.getFixedT(contentLocale, "createVideo");
  const costEstimate = useMemo(() => {
    const profileId = predictRenderProfileId({
      preferLipSync: lipSyncRequested,
      hasPhotoPlates: visualFiles.length > 0 || productFiles.length > 0
    });
    return estimateRunCost(
      { budgetMode: true, durationSeconds },
      profileToProductionCostConfig(getRenderProfile(profileId))
    );
  }, [lipSyncRequested, visualFiles.length, productFiles.length, durationSeconds]);

  const MAX_VOICE_BYTES = 10 * 1024 * 1024;
  const MAX_REFERENCE_VIDEO_BYTES = 15 * 1024 * 1024;
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

  const productPreviewUrls = useMemo(
    () => productFiles.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [productFiles]
  );
  useEffect(() => {
    return () => {
      for (const item of productPreviewUrls) URL.revokeObjectURL(item.url);
    };
  }, [productPreviewUrls]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("prompt2spot:create-draft");
      if (!saved) return;
      const draft = JSON.parse(saved) as {
        title?: string;
        prompt?: string;
        instructions?: string;
        exclusions?: string;
        videoGoal?: string;
        desiredAction?: string;
        targetAudience?: string;
        moods?: string[];
        platform?: string;
        narrationMode?: string;
        musicMode?: string;
        durationSeconds?: number;
        approvalMode?: ApprovalMode;
        creative?: CreativeOptions;
        catalogSelections?: Record<string, string | number>;
        businessName?: string;
        slogan?: string;
        websiteUrl?: string;
      };
      setTitle(draft.title ?? "");
      setPrompt(draft.prompt ?? "");
      setInstructions(draft.instructions ?? "");
      setExclusions(draft.exclusions ?? "");
      setShowExclusions(Boolean(draft.exclusions));
      setVideoGoal(draft.videoGoal ? (LEGACY_GOALS[draft.videoGoal] ?? draft.videoGoal) : "");
      setDesiredAction(draft.desiredAction ? (LEGACY_ACTIONS[draft.desiredAction] ?? draft.desiredAction) : "");
      setTargetAudience(draft.targetAudience ?? "");
      setMoods(Array.isArray(draft.moods) ? draft.moods.slice(0, 2).map((mood) => LEGACY_MOODS[mood] ?? mood) : []);
      setPlatform(draft.platform ?? "instagram_reels");
      setNarrationMode(draft.narrationMode ?? "voiceover");
      setMusicMode(draft.musicMode ?? "auto");
      if (draft.durationSeconds) setDurationSeconds(draft.durationSeconds);
      if (draft.approvalMode) setApprovalMode(draft.approvalMode);
      if (draft.creative) {
        setCreative({
          ...draft.creative,
          ...(draft.creative.language
            ? { language: languageCodeFromCreative(draft.creative) ?? draft.creative.language }
            : {})
        });
      }
      if (draft.catalogSelections) setCatalogSelections(draft.catalogSelections);
      setBusinessName(draft.businessName ?? "");
      setSlogan(draft.slogan ?? "");
      setWebsiteUrl(draft.websiteUrl ?? "");
    } catch {
      // Ignore an invalid local draft and start clean.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft = {
        title,
        prompt,
        instructions,
        exclusions,
        videoGoal,
        desiredAction,
        targetAudience,
        moods,
        platform,
        narrationMode,
        musicMode,
        durationSeconds,
        approvalMode,
        creative,
        catalogSelections,
        businessName,
        slogan,
        websiteUrl
      };
      window.localStorage.setItem("prompt2spot:create-draft", JSON.stringify(draft));
      setDraftSavedAt(new Date());
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    title,
    prompt,
    instructions,
    exclusions,
    videoGoal,
    desiredAction,
    targetAudience,
    moods,
    platform,
    narrationMode,
    musicMode,
    durationSeconds,
    approvalMode,
    creative,
    catalogSelections,
    businessName,
    slogan,
    websiteUrl
  ]);

  const previewAspect = aspectRatioFromCreative(creative) ?? "9:16";
  const showBrandingPreview = Boolean(businessName.trim() || slogan.trim() || websiteUrl.trim() || logoFile);

  function addVisualFiles(incoming: FileList | File[]) {
    const next = [...visualFiles];
    for (const file of Array.from(incoming)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_VISUAL_BYTES) {
        setError(t("validation.characterTooLarge", { name: file.name }));
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
        continue;
      }
      if (next.length >= MAX_VISUAL_FILES) {
        setError(t("validation.characterLimit", { count: MAX_VISUAL_FILES }));
        break;
      }
      next.push(file);
    }
    setVisualFiles(next);
  }

  function removeVisualFile(index: number) {
    setVisualFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function addProductFiles(incoming: FileList | File[]) {
    const next = [...productFiles];
    for (const file of Array.from(incoming)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_VISUAL_BYTES) {
        setError(t("validation.productTooLarge", { name: file.name }));
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
        continue;
      }
      if (next.length >= MAX_VISUAL_FILES) {
        setError(t("validation.productLimit", { count: MAX_VISUAL_FILES }));
        break;
      }
      next.push(file);
    }
    setProductFiles(next);
  }

  function removeProductFile(index: number) {
    setProductFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function addMixedFiles(incoming: FileList | File[]) {
    let hasReferenceVideo = Boolean(referenceVideoFile);
    let hasInsertVideo = Boolean(insertFile);
    for (const file of Array.from(incoming)) {
      const name = file.name.toLowerCase();
      if (file.type.startsWith("audio/")) {
        setVoiceFile(file);
        continue;
      }
      if (file.type.startsWith("video/")) {
        if (!hasReferenceVideo) {
          setReferenceVideoFile(file);
          hasReferenceVideo = true;
        } else if (!hasInsertVideo) {
          setInsertFile(file);
          hasInsertVideo = true;
        }
        continue;
      }
      if (file.type.startsWith("image/")) {
        if (/logo|לוגו/.test(name) && !logoFile) setLogoFile(file);
        else addVisualFiles([file]);
      }
    }
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

  function toggleMood(mood: string) {
    setMoods((current) => {
      if (current.includes(mood)) return current.filter((item) => item !== mood);
      if (current.length >= 2) return [current[1]!, mood];
      return [...current, mood];
    });
  }

  async function submit() {
    if (!canCreate) {
      setError(t("validation.noCredits"));
      return;
    }
    if (!title.trim() || !prompt.trim() || !videoGoal) {
      setError(t("validation.required"));
      return;
    }
    if (voiceFile && !voiceConsent) {
      setError(t("validation.voiceConsent"));
      return;
    }
    if (voiceFile && voiceFile.size > MAX_VOICE_BYTES) {
      setError(t("validation.voiceSize"));
      return;
    }
    if (insertFile && insertFile.size > MAX_INSERT_BYTES) {
      setError(t("validation.insertSize"));
      return;
    }
    if (referenceVideoFile && referenceVideoFile.size > MAX_REFERENCE_VIDEO_BYTES) {
      setError(t("validation.referenceSize"));
      return;
    }
    if (logoFile && logoFile.size > MAX_LOGO_BYTES) {
      setError(t("validation.logoSize"));
      return;
    }
    if (lipSyncRequested && visualFiles.length === 0) {
      setError(t("validation.anchorRequired"));
      return;
    }
    if (visualFiles.length > MAX_VISUAL_FILES) {
      setError(t("validation.characterLimit", { count: MAX_VISUAL_FILES }));
      return;
    }
    if (visualFiles.some((f) => f.size > MAX_VISUAL_BYTES)) {
      setError(t("validation.characterAnyTooLarge"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const attachments: Array<{
        name: string;
        mimeType: string;
        kind: "image" | "video" | "audio";
        role: "anchor" | "voice_clone" | "insert_clip" | "reference_video" | "logo" | "product";
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
      const productAttachments = await Promise.all(
        productFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || "image/png",
          kind: "image" as const,
          role: "product" as const,
          dataUrl: await fileToDataUrl(file)
        }))
      );
      attachments.push(...productAttachments);
      if (voiceFile) {
        attachments.push({
          name: voiceFile.name,
          mimeType: voiceFile.type || "audio/mpeg",
          kind: "audio",
          role: "voice_clone",
          dataUrl: await fileToDataUrl(voiceFile)
        });
      }
      if (referenceVideoFile) {
        attachments.push({
          name: referenceVideoFile.name,
          mimeType: referenceVideoFile.type || "video/mp4",
          kind: "video",
          role: "reference_video",
          dataUrl: await fileToDataUrl(referenceVideoFile)
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
      const creativeWithBasics: CreativeOptions = {
        ...creative,
        videoOrientation: platform === "youtube" || platform === "website" ? "landscape" : "portrait",
        preferHeygenDub: lipSyncRequested ? "on" : "off",
        ...(musicMode === "calm" ? { musicTempo: "איטי" } : {}),
        ...(musicMode === "energetic" ? { musicTempo: "מהיר" } : {})
      };
      const creativeRecord = creativeWithBasics as Record<string, unknown>;
      const creativeWithCodes = Object.fromEntries(
        Object.entries(creativeRecord).map(([key, value]) => {
          const managed = catalog.byKey.get(key);
          const option = managed?.options.find(
            (candidate) => candidate.value === String(value) || candidate.code === String(value)
          );
          return [key, option?.code ?? value];
        })
      ) as CreativeOptions;
      const creativePayload = Object.keys(creativeWithCodes).length > 0 ? creativeWithCodes : undefined;
      const creativeCatalogSnapshot = catalog.fields.flatMap((field) => {
        const selected = creativeRecord[field.key] ?? catalogSelections[field.key];
        if (selected == null || selected === "") return [];
        const option = field.options.find(
          (candidate) => candidate.value === String(selected) || candidate.code === String(selected)
        );
        return [
          {
            fieldKey: field.key,
            fieldLabel: field.label,
            ...(option ? { optionCode: option.code, optionLabel: option.label } : {}),
            value: typeof selected === "number" ? selected : String(selected)
          }
        ];
      });
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
          sourceText: [
            videoGoal ? contentT("brief.goal", { value: contentT(`goals.${videoGoal}`) }) : "",
            prompt.trim(),
            desiredAction ? contentT("brief.action", { value: contentT(`actions.${desiredAction}`) }) : "",
            moods.length ? contentT("brief.mood", { value: moods.map((mood) => contentT(`moods.${mood}`)).join(", ") }) : "",
            contentT("brief.platform", { value: contentT(`platforms.${platform}`) })
          ]
            .filter(Boolean)
            .join("\n"),
          ...((instructions.trim() || exclusions.trim() || narrationMode !== "voiceover" || musicMode === "none")
            ? {
                instructions: [
                  instructions.trim(),
                  narrationMode === "none"
                    ? contentT("brief.noNarration")
                    : narrationMode === "dialogue"
                      ? contentT("brief.dialogue")
                      : "",
                  musicMode === "none" ? contentT("brief.noMusic") : "",
                  exclusions.trim() ? contentT("brief.exclusions", { value: exclusions.trim() }) : ""
                ]
                  .filter(Boolean)
                  .join("\n")
              }
            : {}),
          ...(targetAudience.trim() ? { targetAudience: targetAudience.trim() } : {}),
          language: languageCodeFromCreative(creativeWithBasics) ?? "he",
          durationSeconds,
          aspectRatio: aspectRatioFromCreative(creativeWithBasics) ?? "9:16",
          budgetMode: true,
          approvalMode,
          attachments,
          ...(creativePayload ? { creative: creativePayload } : {}),
          ...(creativeCatalogSnapshot.length ? { creativeCatalogSnapshot } : {}),
          ...(brandingPayload ? { branding: brandingPayload } : {})
        }
      });
      window.localStorage.removeItem("prompt2spot:create-draft");
      onCreated(run);
    } catch (err) {
      const e = err as Error & { code?: string };
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const builtInKeys = new Set(
    CREATIVE_FIELD_SECTIONS.flatMap((section) => section.fields.map((field) => String(field.key)))
  );
  const fieldsFor = (sectionId: string) =>
    (CREATIVE_FIELD_SECTIONS.find((section) => section.id === sectionId)?.fields ?? []).map((field) => {
      const managed = catalog.byKey.get(String(field.key));
      if (!managed) return field;
      return {
        ...field,
        labelHe: managed.label,
        options:
          field.kind === "select"
            ? managed.options.map((option) => ({
                value: option.value,
                code: option.code,
                labelHe: option.label,
                labelEn: option.label
              }))
            : field.options
      };
    });
  const customCatalogFields = catalog.fields.filter((field) => !builtInKeys.has(field.key));
  const basicKeys = new Set<keyof CreativeOptions>([
    "videoOrientation",
    "language",
    "targetAudience",
    "filmTemplate",
    "karaokeCaptions"
  ]);
  const advancedGroups = [
    {
      id: "format",
      title: t("advanced.groups.format.title"),
      description: t("advanced.groups.format.description"),
      fields: fieldsFor("envelope").filter((field) => !basicKeys.has(field.key))
    },
    {
      id: "visual-style",
      title: t("advanced.groups.visualStyle.title"),
      description: t("advanced.groups.visualStyle.description"),
      fields: [...fieldsFor("brief"), ...fieldsFor("visual").filter((field) => field.key === "lighting")].filter(
        (field) => !basicKeys.has(field.key)
      )
    },
    {
      id: "script",
      title: t("advanced.groups.script.title"),
      description: t("advanced.groups.script.description"),
      fields: fieldsFor("script")
    },
    {
      id: "voice",
      title: t("advanced.groups.voice.title"),
      description: t("advanced.groups.voice.description"),
      fields: [
        ...fieldsFor("dubbing"),
        ...fieldsFor("render").filter((field) => field.key === "preferHeygenDub")
      ]
    },
    {
      id: "music",
      title: t("advanced.groups.music.title"),
      description: t("advanced.groups.music.description"),
      fields: fieldsFor("music")
    },
    {
      id: "camera",
      title: t("advanced.groups.camera.title"),
      description: t("advanced.groups.camera.description"),
      fields: [
        ...fieldsFor("visual").filter((field) => field.key !== "lighting"),
        ...fieldsFor("render").filter(
          (field) => field.key !== "preferHeygenDub" && !basicKeys.has(field.key)
        )
      ]
    }
  ];
  const requiredMissing = [
    !title.trim() ? t("summary.titleField") : "",
    !videoGoal ? t("summary.goalField") : "",
    !prompt.trim() ? t("summary.descriptionField") : ""
  ].filter(Boolean);
  const requiredComplete = 3 - requiredMissing.length;
  const estimatedMinutesMin = Math.max(4, Math.ceil(durationSeconds / 15) * 2);
  const estimatedMinutesMax = estimatedMinutesMin + 4;
  const materialCount =
    visualFiles.length +
    productFiles.length +
    Number(Boolean(voiceFile)) +
    Number(Boolean(referenceVideoFile)) +
    Number(Boolean(insertFile)) +
    Number(Boolean(logoFile));

  return (
    <div className="create-form" dir={i18n.dir()}>
      <header className="create-page-header">
        <button type="button" className="button-secondary back-button" onClick={onCancel}>
          <span aria-hidden>{i18n.dir() === "rtl" ? "→" : "←"}</span>
          {t("create.back")}
        </button>
        <div className="page-heading">
          <p className="eyebrow">{t("create.eyebrow")}</p>
          <h1>{t("create.title")}</h1>
          <p className="muted">{t("create.subtitle")}</p>
          <small className="draft-status">{draftSavedAt ? t("create.draftSaved") : t("create.draftActive")}</small>
        </div>
      </header>
      <nav className="create-progress" aria-label={t("progress.aria")}>
        <span className="is-active"><i>1</i>{t("progress.idea")}</span>
        <span><i>2</i>{t("progress.script")}</span>
        <span><i>3</i>{t("progress.audio")}</span>
        <span><i>4</i>{t("progress.review")}</span>
      </nav>
      {freeLeft > 0 ? (
        <p className="credit-info-line">
          <span aria-hidden>✦</span>
          {t("credits.free", { count: freeLeft })}
          <small>{t("credits.noCharge")}</small>
        </p>
      ) : null}
      <section className="create-topic-card" aria-labelledby="video-details-heading">
        <div className="form-section-heading">
          <span className="form-section-icon" aria-hidden>✦</span>
          <div>
            <h2 id="video-details-heading">{t("details.heading")}</h2>
            <p>{t("details.help")}</p>
          </div>
        </div>

        <label className="field-block">
          {t("details.title")} <span className="required-mark">{t("common.required")}</span>
          <input
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("details.titlePlaceholder")}
          />
          {title.length > 170 ? <small className="field-counter">{title.length}/200</small> : null}
        </label>

        <fieldset className="choice-fieldset">
          <legend>{t("details.goal")} <span className="required-mark">{t("common.required")}</span></legend>
          <div className="choice-chips">
            {VIDEO_GOALS.map((goal) => (
              <button
                key={goal}
                type="button"
                className={videoGoal === goal ? "is-selected" : ""}
                onClick={() => setVideoGoal(goal)}
              >
                {t(`goals.${goal}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field-block">
          {t("details.subject")} <span className="required-mark">{t("common.required")}</span>
          <textarea
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              videoGoal === "product"
                ? t("details.subjectProduct")
                : videoGoal === "service"
                  ? t("details.subjectService")
                  : t("details.subjectDefault")
            }
          />
        </label>

        <div className="common-fields-grid">
          <label className="field-block">
            {t("details.audience")} <span className="optional-mark">{t("common.optional")}</span>
            <input
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder={t("details.audiencePlaceholder")}
            />
          </label>
          <label className="field-block">
            {t("details.action")} <span className="optional-mark">{t("common.optional")}</span>
            <select value={desiredAction} onChange={(e) => setDesiredAction(e.target.value)}>
              <option value="">{t("details.actionAuto")}</option>
              {DESIRED_ACTIONS.map((action) => (
                <option key={action} value={action}>{t(`actions.${action}`)}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="choice-fieldset">
          <legend>{t("details.mood")} <span className="optional-mark">{t("details.moodLimit")}</span></legend>
          <div className="choice-chips">
            {MOOD_OPTIONS.map((mood) => (
              <button
                key={mood}
                type="button"
                className={moods.includes(mood) ? "is-selected" : ""}
                aria-pressed={moods.includes(mood)}
                onClick={() => toggleMood(mood)}
              >
                {t(`moods.${mood}`)}
              </button>
            ))}
          </div>
          <small className="field-help">{t("details.moodHelp")}</small>
        </fieldset>

        <label className="field-block">
          {t("details.instructions")} <span className="optional-mark">{t("common.optional")}</span>
          <textarea
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t("details.instructionsPlaceholder")}
          />
        </label>
        <button type="button" className="inline-disclosure" onClick={() => setShowExclusions((value) => !value)}>
          {showExclusions ? t("details.hideExclusions") : t("details.addExclusions")}
        </button>
        {showExclusions ? (
          <label className="field-block">
            {t("details.exclusions")}
            <textarea
              rows={3}
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              placeholder={t("details.exclusionsPlaceholder")}
            />
          </label>
        ) : null}
      </section>
      <section className="create-topic-card materials-section" aria-labelledby="materials-heading">
        <div className="form-section-heading">
          <span className="form-section-icon" aria-hidden>◫</span>
          <div>
            <h2 id="materials-heading">{t("materials.heading")} <span className="optional-mark">{t("common.optional")}</span></h2>
            <p>{t("materials.help")}</p>
          </div>
        </div>
        <label className="unified-upload-zone">
          <span className="upload-zone-icon" aria-hidden>↑</span>
          <strong>{t("materials.drop")}</strong>
          <small>{t("materials.choose")}</small>
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,audio/*"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) addMixedFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <p className="materials-classification-note">
          {t("materials.classification")}
        </p>
        <details className="material-role-details">
          <summary>
            <span>{t("materials.manage")}</span>
            <strong>{materialCount ? t("materials.uploaded", { count: materialCount }) : t("materials.manual")}</strong>
          </summary>
          <div className="material-role-body">
      <label className="file-row">
        {t("materials.characters")}
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
          {t("materials.charactersHelp", { count: MAX_VISUAL_FILES })}
        </small>
      </label>
      {visualFiles.length ? (
        <ul className="visual-files-list">
          {visualPreviewUrls.map((item, index) => (
            <li key={`${item.name}-${index}`} className="visual-file-item">
              <img src={item.url} alt={t("materials.characterAlt", { name: item.name })} className="visual-file-thumb" />
              <span className="visual-file-name" title={item.name}>
                {item.name}
              </span>
              <button type="button" className="link-btn" onClick={() => removeVisualFile(index)}>
                {t("common.remove")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="file-row">
        {t("materials.products")}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) addProductFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <small className="muted">
          {t("materials.productsHelp", { count: MAX_VISUAL_FILES })}
        </small>
      </label>
      {productFiles.length ? (
        <ul className="visual-files-list">
          {productPreviewUrls.map((item, index) => (
            <li key={`product-${item.name}-${index}`} className="visual-file-item">
              <img src={item.url} alt={t("materials.productAlt", { name: item.name })} className="visual-file-thumb" />
              <span className="visual-file-name" title={item.name}>
                {item.name}
              </span>
              <button type="button" className="link-btn" onClick={() => removeProductFile(index)}>
                {t("common.remove")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="file-row">
        {t("materials.voice")}
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
          {t("materials.voiceHelp")}
        </small>
      </label>
      {voiceFile ? (
        <label className="consent-row">
          <input type="checkbox" checked={voiceConsent} onChange={(e) => setVoiceConsent(e.target.checked)} />
          {t("materials.voiceConsent")}
        </label>
      ) : null}
      <label className="file-row">
        {t("materials.reference")}
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
          onChange={(e) => setReferenceVideoFile(e.target.files?.[0] ?? null)}
        />
        <small className="muted">
          {t("materials.referenceHelp")}
        </small>
        {referenceVideoFile ? (
          <span className="upload-status">
            {t("materials.referenceSelected", { name: referenceVideoFile.name })}
            <button
              type="button"
              className="link-btn"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setReferenceVideoFile(null);
              }}
            >
              {t("common.remove")}
            </button>
          </span>
        ) : null}
      </label>
      <label className="file-row">
        {t("materials.insert")}
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
          onChange={(e) => setInsertFile(e.target.files?.[0] ?? null)}
        />
        <small className="muted">{t("materials.insertHelp")}</small>
      </label>
      {insertFile ? (
        <div className="insert-clip-options">
          <label>
            {t("materials.insertAt")}
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
            <legend>{t("materials.insertAudio")}</legend>
            <label>
              <input
                type="radio"
                checked={insertAudioSource === "clip"}
                onChange={() => setInsertAudioSource("clip")}
              />
              {t("materials.originalAudio")}
            </label>
            <label>
              <input
                type="radio"
                checked={insertAudioSource === "narration"}
                onChange={() => setInsertAudioSource("narration")}
              />
              {t("materials.narrationAudio")}
            </label>
          </fieldset>
        </div>
      ) : null}
          </div>
        </details>
      </section>
      <section className="create-topic-card basic-settings-section" aria-labelledby="basic-settings-heading">
        <div className="form-section-heading">
          <span className="form-section-icon" aria-hidden>◎</span>
          <div>
            <h2 id="basic-settings-heading">{t("basic.heading")}</h2>
            <p>{t("basic.help")}</p>
          </div>
        </div>
        <fieldset className="choice-fieldset duration-picker">
          <legend>{t("basic.duration")}</legend>
          <div className="choice-chips">
            {[15, 30, 45, 60].map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={durationSeconds === seconds ? "is-selected" : ""}
                onClick={() => setDurationSeconds(seconds)}
              >
                {t("common.secondsShort", { count: seconds })} {seconds === 30 ? <small>{t("common.recommended")}</small> : null}
              </button>
            ))}
            <label className={![15, 30, 45, 60].includes(durationSeconds) ? "custom-duration is-selected" : "custom-duration"}>
              {t("common.custom")}
              <input
                type="number"
                min={5}
                max={180}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Math.min(180, Math.max(5, Number(e.target.value) || 30)))}
              />
            </label>
          </div>
          <small className="field-help">{t("basic.durationHelp")}</small>
        </fieldset>

        <div className="common-fields-grid common-fields-grid-three">
          <label className="field-block">
            {t("basic.platform")}
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {["instagram_reels", "tiktok", "youtube_shorts", "linkedin", "youtube", "website"].map((code) => (
                <option key={code} value={code}>{t(`platforms.${code}`)}</option>
              ))}
            </select>
          </label>
          <label className="field-block">
            {t("basic.contentLanguage")}
            <select
              value={String(creative.language ?? "he")}
              onChange={(e) => setCreativeField("language", e.target.value as never)}
            >
              {CONTENT_LANGUAGES.map(([value, labelKey]) => (
                <option key={value} value={value}>{t(`languages.${labelKey}`)}</option>
              ))}
            </select>
            <small className="field-help">{t("basic.contentLanguageHelp")}</small>
          </label>
          <label className="field-block">
            {t("basic.filmType")}
            <select
              value={String(creative.filmTemplate ?? "social_explainer")}
              onChange={(e) => setCreativeField("filmTemplate", e.target.value as never)}
            >
              {["social_explainer", "product_demo", "testimonial", "public_service_explainer", "corporate_product"].map((code) => (
                <option key={code} value={code}>{t(`filmTypes.${code}`)}</option>
              ))}
            </select>
          </label>
          <label className="field-block">
            {t("basic.narration")}
            <select value={narrationMode} onChange={(e) => setNarrationMode(e.target.value)}>
              {["voiceover", "dialogue", "lip_sync", "none"].map((code) => (
                <option key={code} value={code}>{t(`narration.${code}`)}</option>
              ))}
            </select>
          </label>
          <label className="field-block">
            {t("basic.music")}
            <select value={musicMode} onChange={(e) => setMusicMode(e.target.value)}>
              {["auto", "calm", "energetic", "none"].map((code) => (
                <option key={code} value={code}>{t(`music.${code}`)}</option>
              ))}
            </select>
          </label>
          <label className="field-block">
            {t("basic.captions")}
            <select
              value={String(creative.karaokeCaptions ?? "on")}
              onChange={(e) => setCreativeField("karaokeCaptions", e.target.value as never)}
            >
              <option value="on">{t("captions.on")}</option>
              <option value="off">{t("captions.off")}</option>
            </select>
          </label>
        </div>

        <details className="cost-details">
          <summary>
            <span>{t("cost.heading")}</span>
            <strong>{freeLeft > 0 ? t("credits.freeVideo") : t("credits.oneCredit")}</strong>
          </summary>
          <p title={t("cost.tooltip", { model: costEstimate.videoModelDisplay, rate: costEstimate.perSecondUsd.toFixed(3) })}>
            {t("cost.system", { cost: formatCostNis(costEstimate.nis), provider: costEstimate.videoProviderLabel, seconds: costEstimate.veoSeconds })}
          </p>
        </details>
      <fieldset className="approval-fieldset approval-card-picker">
        <legend>{t("approval.heading")}</legend>
        <label>
          <input type="radio" checked={approvalMode === "auto"} onChange={() => setApprovalMode("auto")} />
          <span><strong>{t("approval.autoTitle")}</strong><small>{t("approval.autoHelp")}</small></span>
        </label>
        <label>
          <input
            type="radio"
            checked={approvalMode === "auto_until_render"}
            onChange={() => setApprovalMode("auto_until_render")}
          />
          <span><strong>{t("approval.previewTitle")}</strong><small>{t("approval.previewHelp")}</small></span>
        </label>
        <label>
          <input type="radio" checked={approvalMode === "manual"} onChange={() => setApprovalMode("manual")} />
          <span><strong>{t("approval.manualTitle")}</strong><small>{t("approval.manualHelp")}</small></span>
        </label>
      </fieldset>
      </section>

      <details className="branding-section optional-disclosure">
        <summary>
          <span className="form-section-icon" aria-hidden>✦</span>
          <span><strong>{t("branding.heading")}</strong><small>{t("branding.summaryHelp")}</small></span>
          <span className="disclosure-status">{businessName || logoFile ? t("branding.configured") : t("branding.optional")}</span>
        </summary>
        <div className="optional-disclosure-body">
        <div className="form-section-heading">
          <span className="form-section-icon" aria-hidden>✦</span>
          <div>
            <h2 className="branding-section-title">{t("branding.heading")}</h2>
            <p className="muted branding-hint">{t("branding.help")}</p>
          </div>
        </div>
        <label>
          {t("branding.businessName")}
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder={t("branding.businessPlaceholder")}
            maxLength={120}
          />
        </label>
        <label>
          {t("branding.slogan")}
          <input
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder={t("branding.sloganPlaceholder")}
            maxLength={200}
          />
        </label>
        <label>
          {t("branding.website")}
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            maxLength={300}
            inputMode="url"
          />
        </label>
        <label className="file-row">
          {t("branding.logo")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
          <small className="muted">{t("branding.logoHelp")}</small>
        </label>
        {showBrandingPreview ? (
          <div
            className={`branding-preview branding-preview-${previewAspect === "16:9" ? "landscape" : "portrait"}`}
            aria-live="polite"
            aria-label={t("branding.previewAria")}
          >
            <div className="branding-preview-inner">
              {logoPreviewUrl ? (
                <img src={logoPreviewUrl} alt={t("branding.logoAlt", { name: businessName || t("branding.businessName") })} className="branding-preview-logo" />
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
        </div>
      </details>

      <details
        className="advanced-disclosure"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span className="form-section-icon" aria-hidden>⚙</span>
          <span><strong>{t("advanced.heading")}</strong><small>{t("advanced.summaryHelp")}</small></span>
          <span className="disclosure-status">{t("common.optional")}</span>
        </summary>
        <div className="advanced-panel">
          <div className="advanced-presets-head">
            <div>
              <h3>{t("advanced.presetsHeading")}</h3>
              <p>{t("advanced.presetsHelp")}</p>
            </div>
          </div>
          <div className="advanced-presets preset-cards">
            <button
              type="button"
              onClick={() => {
                setCreative((previous) => ({
                  ...previous,
                  filmTemplate: "product_demo",
                  designStyle: "הדגמת מוצר",
                  communicationStyle: "משכנע",
                  pace: "אנרגטי",
                  karaokeCaptions: "on"
                }));
                setVideoGoal("product");
              }}
            >
              <strong>{t("advanced.presets.product.title")}</strong><small>{t("advanced.presets.product.help")}</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setDurationSeconds(90);
                setPlatform("youtube");
                setCreative((previous) => ({
                  ...previous,
                  filmTemplate: "corporate_product",
                  designStyle: "סרט מוצר B2B",
                  communicationStyle: "מקצועי",
                  speechStyle: "חדשותי",
                  lowerThirds: "on"
                }));
              }}
            >
              <strong>{t("advanced.presets.b2b.title")}</strong><small>{t("advanced.presets.b2b.help")}</small>
            </button>
            <button
              type="button"
              onClick={() => setCreative((previous) => ({
                ...previous,
                filmTemplate: "testimonial",
                designStyle: "UGC אותנטי",
                communicationStyle: "סיפור אישי",
                speechStyle: "שיחתי"
              }))}
            >
              <strong>{t("advanced.presets.personal.title")}</strong><small>{t("advanced.presets.personal.help")}</small>
            </button>
            <button
              type="button"
              onClick={() => setCreative((previous) => ({
                ...previous,
                designStyle: "חדשות אולפן",
                communicationStyle: "חדשותי",
                location: "אולפן חדשות",
                lowerThirds: "on"
              }))}
            >
              <strong>{t("advanced.presets.news.title")}</strong><small>{t("advanced.presets.news.help")}</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setDurationSeconds(30);
                setPlatform("instagram_reels");
                setCreative((previous) => ({
                  ...previous,
                  filmTemplate: "social_explainer",
                  designStyle: "סרטון הסברה",
                  communicationStyle: "הסברתי",
                  pace: "מהיר",
                  karaokeCaptions: "on"
                }));
              }}
            >
              <strong>{t("advanced.presets.social.title")}</strong><small>{t("advanced.presets.social.help")}</small>
            </button>
          </div>

          {advancedGroups.map((group, index) => (
            <details key={group.id} className="advanced-accordion" open={index === 0}>
              <summary>
                <span><strong>{group.title}</strong><small>{group.description}</small></span>
                <span aria-hidden>⌄</span>
              </summary>
              <div className="advanced-grid">
                {group.fields.map((field) => (
                  <label key={`${group.id}-${field.key}`}>
                    {field.labelHe}
                    {field.kind === "number" ? (
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        value={creative[field.key] == null ? "" : String(creative[field.key])}
                        onChange={(event) => {
                          const raw = event.target.value;
                          setCreativeField(field.key, raw ? (Number(raw) as never) : "");
                        }}
                      />
                    ) : (
                      <select
                        value={String(creative[field.key] ?? "")}
                        onChange={(event) => setCreativeField(field.key, (event.target.value || "") as never)}
                      >
                        <option value="">{t("advanced.auto")}</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.labelHe}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                ))}
                {group.id === "voice" && (narrationMode === "lip_sync" || visualFiles.length > 0) ? (
                  <p className={heygenNeedsAnchor ? "error-inline accordion-note" : "muted accordion-note"}>
                    {t("advanced.lipSyncHelp")}
                  </p>
                ) : null}
              </div>
            </details>
          ))}
          {customCatalogFields.length ? (
            <details className="advanced-accordion">
              <summary>
                <span>
                  <strong>{customCatalogFields[0]?.sectionLabel ?? t("advanced.heading")}</strong>
                  <small>{t("advanced.hint")}</small>
                </span>
                <span aria-hidden>⌄</span>
              </summary>
              <div className="advanced-grid">
                {customCatalogFields.map((field) => (
                  <label key={field.id}>
                    {field.label}
                    {field.kind === "number" ? (
                      <input
                        type="number"
                        min={typeof field.config.min === "number" ? field.config.min : undefined}
                        max={typeof field.config.max === "number" ? field.config.max : undefined}
                        step={typeof field.config.step === "number" ? field.config.step : 1}
                        placeholder={field.placeholder}
                        value={catalogSelections[field.key] ?? ""}
                        onChange={(event) =>
                          setCatalogSelections((current) => ({
                            ...current,
                            [field.key]: event.target.value ? Number(event.target.value) : ""
                          }))
                        }
                      />
                    ) : (
                      <select
                        value={catalogSelections[field.key] ?? ""}
                        onChange={(event) =>
                          setCatalogSelections((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                      >
                        <option value="">{t("advanced.auto")}</option>
                        {field.options.map((option) => (
                          <option key={option.id} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    )}
                    {field.helpText ? <small className="field-help">{field.helpText}</small> : null}
                  </label>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </details>

      {error ? <p className="error-inline">{error}</p> : null}
      <div className="stage-actions create-actions">
        <div className="creation-summary-metrics">
          <span><small>{t("summary.cost")}</small><strong>{freeLeft > 0 ? t("credits.freeVideo") : t("credits.oneCredit")}</strong></span>
          <span><small>{t("summary.time")}</small><strong>{t("summary.minutes", { min: estimatedMinutesMin, max: estimatedMinutesMax })}</strong></span>
          <span className={requiredComplete === 3 ? "is-ready" : ""}>
            <small>{t("summary.status")}</small>
            <strong>{requiredComplete === 3 ? t("summary.ready") : t("summary.missing", { fields: requiredMissing.join(", ") })}</strong>
          </span>
        </div>
        <div className="creation-summary-actions">
          <button type="button" className="button-secondary" onClick={() => setDraftSavedAt(new Date())}>
            {t("summary.saveDraft")}
          </button>
          <details className="creation-summary-popover">
            <summary>{t("summary.preview")}</summary>
            <div>
              <strong>{title || t("summary.untitled")}</strong>
              <span>{videoGoal ? t(`goals.${videoGoal}`) : t("summary.noGoal")} · {t("common.secondsShort", { count: durationSeconds })} · {t(`platforms.${platform}`)}</span>
              <span>{targetAudience || t("summary.autoAudience")} · {moods.length ? moods.map((mood) => t(`moods.${mood}`)).join(", ") : t("summary.autoMood")}</span>
            </div>
          </details>
        <button
          type="button"
          className="primary"
          disabled={
            busy ||
            !canCreate ||
            !title.trim() ||
            !prompt.trim() ||
            !videoGoal ||
            (!!voiceFile && !voiceConsent) ||
            heygenNeedsAnchor
          }
          onClick={() => void submit()}
        >
          {busy ? t("summary.creating") : t("summary.create")}
          {!busy ? <span aria-hidden>{i18n.dir() === "rtl" ? "←" : "→"}</span> : null}
        </button>
        </div>
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