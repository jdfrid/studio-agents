import { useEffect, useMemo, useState } from "react";
import { apiPost } from "./api.js";
import { useAuth } from "./AuthContext.js";
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
  type CreativeOptions
} from "@studio/shared";

const VIDEO_GOALS = [
  "פרסום מוצר",
  "פרסום שירות",
  "תדמית עסקית",
  "רשתות חברתיות",
  "הסבר או הדרכה",
  "הזמנה לאירוע",
  "אחר"
] as const;

const DESIRED_ACTIONS = [
  "לקנות",
  "להיכנס לאתר",
  "להשאיר פרטים",
  "ליצור קשר",
  "ללמוד ולהבין",
  "לזכור את המותג",
  "ללא פעולה מוגדרת"
] as const;

const MOOD_OPTIONS = [
  "מקצועי ואמין",
  "יוקרתי",
  "מרגש",
  "צעיר ואנרגטי",
  "נקי ומודרני",
  "דרמטי",
  "רגוע",
  "אחר"
] as const;

export function CreateVideoForm({ onCreated, onCancel }: { onCreated: (run: ProjectRunView) => void; onCancel: () => void }) {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preferHeygenDub = creative.preferHeygenDub === "on";
  const heygenNeedsAnchor = preferHeygenDub && visualFiles.length === 0;
  const costEstimate = useMemo(() => {
    const profileId = predictRenderProfileId({
      preferLipSync: preferHeygenDub,
      hasPhotoPlates: visualFiles.length > 0 || productFiles.length > 0
    });
    return estimateRunCost(
      { budgetMode: true, durationSeconds },
      profileToProductionCostConfig(getRenderProfile(profileId))
    );
  }, [preferHeygenDub, visualFiles.length, productFiles.length, durationSeconds]);

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
        businessName?: string;
        slogan?: string;
        websiteUrl?: string;
      };
      setTitle(draft.title ?? "");
      setPrompt(draft.prompt ?? "");
      setInstructions(draft.instructions ?? "");
      setExclusions(draft.exclusions ?? "");
      setShowExclusions(Boolean(draft.exclusions));
      setVideoGoal(draft.videoGoal ?? "");
      setDesiredAction(draft.desiredAction ?? "");
      setTargetAudience(draft.targetAudience ?? "");
      setMoods(Array.isArray(draft.moods) ? draft.moods.slice(0, 2) : []);
      setPlatform(draft.platform ?? "instagram_reels");
      setNarrationMode(draft.narrationMode ?? "voiceover");
      setMusicMode(draft.musicMode ?? "auto");
      if (draft.durationSeconds) setDurationSeconds(draft.durationSeconds);
      if (draft.approvalMode) setApprovalMode(draft.approvalMode);
      if (draft.creative) setCreative(draft.creative);
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

  function addProductFiles(incoming: FileList | File[]) {
    const next = [...productFiles];
    for (const file of Array.from(incoming)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_VISUAL_BYTES) {
        setError(`תמונת מוצר גדולה מדי (מקסימום 5MB): ${file.name}`);
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
        continue;
      }
      if (next.length >= MAX_VISUAL_FILES) {
        setError(`ניתן להעלות עד ${MAX_VISUAL_FILES} תמונות מוצר.`);
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
      setError("אין מספיק קרדיטים ליצירת סרטון. רכוש קרדיטים או השתמש בסרטון החינמי מהדשבורד.");
      return;
    }
    if (!title.trim() || !prompt.trim() || !videoGoal) {
      setError("יש למלא כותרת, לבחור מטרת סרטון ולתאר את הסרטון.");
      return;
    }
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
    if (referenceVideoFile && referenceVideoFile.size > MAX_REFERENCE_VIDEO_BYTES) {
      setError("סרטון ההשראה גדול מדי (מקסימום 15MB).");
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
        preferHeygenDub: narrationMode === "lip_sync" ? "on" : (creative.preferHeygenDub ?? "off"),
        ...(musicMode === "calm" ? { musicTempo: "איטי" } : {}),
        ...(musicMode === "energetic" ? { musicTempo: "מהיר" } : {})
      };
      const creativePayload = Object.keys(creativeWithBasics).length > 0 ? creativeWithBasics : undefined;
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
            videoGoal ? `מטרת הסרטון: ${videoGoal}` : "",
            prompt.trim(),
            desiredAction ? `הפעולה הרצויה מהצופה: ${desiredAction}` : "",
            moods.length ? `אווירה נדרשת: ${moods.join(", ")}` : "",
            `פלטפורמת יעד: ${platform}`
          ]
            .filter(Boolean)
            .join("\n"),
          ...((instructions.trim() || exclusions.trim() || narrationMode !== "voiceover" || musicMode === "none")
            ? {
                instructions: [
                  instructions.trim(),
                  narrationMode === "none"
                    ? "ללא קריינות או דיבור; להשתמש במוזיקה ובטקסט על המסך בלבד."
                    : narrationMode === "dialogue"
                      ? "להעדיף שיחה טבעית בין הדמויות במקום קריינות חיצונית."
                      : "",
                  musicMode === "none" ? "ללא מוזיקת רקע." : "",
                  exclusions.trim() ? `מה אסור להציג בסרטון: ${exclusions.trim()}` : ""
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

  const fieldsFor = (sectionId: string) =>
    CREATIVE_FIELD_SECTIONS.find((section) => section.id === sectionId)?.fields ?? [];
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
      title: "פורמט וקהל",
      description: "קצב, סגנון תקשורת והרחבות לפורמט",
      fields: fieldsFor("envelope").filter((field) => !basicKeys.has(field.key))
    },
    {
      id: "visual-style",
      title: "סגנון חזותי",
      description: "עיצוב, צבעוניות, מציאותיות, לוגו ותאורה",
      fields: [...fieldsFor("brief"), ...fieldsFor("visual").filter((field) => field.key === "lighting")].filter(
        (field) => !basicKeys.has(field.key)
      )
    },
    {
      id: "script",
      title: "תסריט וסצנות",
      description: "מיקום, דמויות, לבוש, פעולה והבעה",
      fields: fieldsFor("script")
    },
    {
      id: "voice",
      title: "קריינות ודיבור",
      description: "קול, מבטא, סגנון ומהירות דיבור",
      fields: [
        ...fieldsFor("dubbing"),
        ...fieldsFor("render").filter((field) => field.key === "preferHeygenDub")
      ]
    },
    {
      id: "music",
      title: "מוזיקה וסאונד",
      description: "קצב, עוצמה והתאמה לסצנות",
      fields: fieldsFor("music")
    },
    {
      id: "camera",
      title: "צילום ועריכה",
      description: "מצלמה, תנועה, אפקטים, מעברים וטקסט על המסך",
      fields: [
        ...fieldsFor("visual").filter((field) => field.key !== "lighting"),
        ...fieldsFor("render").filter(
          (field) => field.key !== "preferHeygenDub" && !basicKeys.has(field.key)
        )
      ]
    }
  ];
  const requiredMissing = [
    !title.trim() ? "כותרת" : "",
    !videoGoal ? "מטרה" : "",
    !prompt.trim() ? "תיאור" : ""
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
    <div className="create-form">
      <header className="create-page-header">
        <button type="button" className="button-secondary back-button" onClick={onCancel}>
          <span aria-hidden>→</span>
          חזרה
        </button>
        <div className="page-heading">
          <p className="eyebrow">יצירה חדשה</p>
          <h1>בואו נבנה את הסרטון הבא</h1>
          <p className="muted">תארו את הרעיון, בחרו סגנון והעלו חומרים. את שאר ההגדרות נכין עבורכם.</p>
          <small className="draft-status">{draftSavedAt ? "נשמר אוטומטית לפני רגע" : "שמירה אוטומטית פעילה"}</small>
        </div>
      </header>
      <nav className="create-progress" aria-label="שלבי הגדרת הסרטון">
        <span className="is-active"><i>1</i>רעיון וסגנון</span>
        <span><i>2</i>תסריט וסצנות</span>
        <span><i>3</i>קול ומוזיקה</span>
        <span><i>4</i>סקירה ויצירה</span>
      </nav>
      {freeLeft > 0 ? (
        <p className="credit-info-line">
          <span aria-hidden>✦</span>
          {freeLeft === 1 ? "סרטון חינם אחד זמין" : `${freeLeft} סרטונים חינם זמינים`}
          <small>הסרטון הנוכחי לא יפחית מהקרדיטים.</small>
        </p>
      ) : null}
      <section className="create-topic-card" aria-labelledby="video-details-heading">
        <div className="form-section-heading">
          <span className="form-section-icon" aria-hidden>✦</span>
          <div>
            <h2 id="video-details-heading">פרטי הסרטון</h2>
            <p>שלושה פרטים מספיקים כדי להתחיל. אפשר לדייק את השאר רק אם צריך.</p>
          </div>
        </div>

        <label className="field-block">
          כותרת הסרטון <span className="required-mark">חובה</span>
          <input
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="לדוגמה: מבצע קיץ למוצרי היוקרה של Luxy"
          />
          {title.length > 170 ? <small className="field-counter">{title.length}/200</small> : null}
        </label>

        <fieldset className="choice-fieldset">
          <legend>מה מטרת הסרטון? <span className="required-mark">חובה</span></legend>
          <div className="choice-chips">
            {VIDEO_GOALS.map((goal) => (
              <button
                key={goal}
                type="button"
                className={videoGoal === goal ? "is-selected" : ""}
                onClick={() => setVideoGoal(goal)}
              >
                {goal}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field-block">
          על מה הסרטון? <span className="required-mark">חובה</span>
          <textarea
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              videoGoal === "פרסום מוצר"
                ? "מהו המוצר, מה היתרון המרכזי שלו ומה תרצו שהצופה יעשה?"
                : videoGoal === "פרסום שירות"
                  ? "איזה שירות אתם מציעים, למי הוא מתאים ואיזו בעיה הוא פותר?"
                  : "תארו בקצרה את המסר, האנשים, המקום והתוצאה הרצויה."
            }
          />
        </label>

        <div className="common-fields-grid">
          <label className="field-block">
            למי הסרטון מיועד? <span className="optional-mark">לא חובה</span>
            <input
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="לדוגמה: בעלי עסקים קטנים המחפשים פתרון פשוט"
            />
          </label>
          <label className="field-block">
            מה תרצו שהצופה יעשה? <span className="optional-mark">לא חובה</span>
            <select value={desiredAction} onChange={(e) => setDesiredAction(e.target.value)}>
              <option value="">המערכת תציע פעולה מתאימה</option>
              {DESIRED_ACTIONS.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="choice-fieldset">
          <legend>אווירה וסגנון <span className="optional-mark">עד שתי אפשרויות</span></legend>
          <div className="choice-chips">
            {MOOD_OPTIONS.map((mood) => (
              <button
                key={mood}
                type="button"
                className={moods.includes(mood) ? "is-selected" : ""}
                aria-pressed={moods.includes(mood)}
                onClick={() => toggleMood(mood)}
              >
                {mood}
              </button>
            ))}
          </div>
          <small className="field-help">ניישם את האווירה בצבעים, במוזיקה, בקצב, בקריינות ובצילום.</small>
        </fieldset>

        <label className="field-block">
          דברים שחשוב להקפיד עליהם <span className="optional-mark">לא חובה</span>
          <textarea
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="לדוגמה: להשתמש רק בצבעי המותג, להזכיר משלוח חינם, לשמור על לבוש זהה."
          />
        </label>
        <button type="button" className="inline-disclosure" onClick={() => setShowExclusions((value) => !value)}>
          {showExclusions ? "הסתר דברים שלא יופיעו" : "+ הוסף דברים שלא יופיעו בסרטון"}
        </button>
        {showExclusions ? (
          <label className="field-block">
            מה לא להציג?
            <textarea
              rows={3}
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              placeholder="לדוגמה: ללא אנשים, ללא הומור, ללא טקסט שנוצר בתוך התמונה."
            />
          </label>
        ) : null}
      </section>
      <section className="create-topic-card materials-section" aria-labelledby="materials-heading">
        <div className="form-section-heading">
          <span className="form-section-icon" aria-hidden>◫</span>
          <div>
            <h2 id="materials-heading">חומרי גלם <span className="optional-mark">לא חובה</span></h2>
            <p>העלו הכול במקום אחד. המערכת תזהה את סוג הקובץ ותוכלו לדייק את השימוש בהמשך.</p>
          </div>
        </div>
        <label className="unified-upload-zone">
          <span className="upload-zone-icon" aria-hidden>↑</span>
          <strong>גררו לכאן תמונות, סרטונים, לוגו או קובץ קול</strong>
          <small>או לחצו לבחירת מספר קבצים</small>
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
          סיווג אוטומטי זמין. אם קובץ מיועד לתפקיד אחר, השתמשו בבחירה המתאימה למטה.
        </p>
        <details className="material-role-details">
          <summary>
            <span>ניהול וסיווג חומרי הגלם</span>
            <strong>{materialCount ? `${materialCount} קבצים הועלו` : "בחירה ידנית לפי תפקיד"}</strong>
          </summary>
          <div className="material-role-body">
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
        תמונות מוצר / B-roll (אופציונלי)
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
          עד {MAX_VISUAL_FILES} תמונות מוצר — יישמרו כצלחות נעולות בסרטון (בלי להמציא מכשיר אחר). מומלץ לסרט תדמית B2B.
        </small>
      </label>
      {productFiles.length ? (
        <ul className="visual-files-list">
          {productPreviewUrls.map((item, index) => (
            <li key={`product-${item.name}-${index}`} className="visual-file-item">
              <img src={item.url} alt="" className="visual-file-thumb" />
              <span className="visual-file-name" title={item.name}>
                {item.name}
              </span>
              <button type="button" className="link-btn" onClick={() => removeProductFile(index)}>
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
        סרטון השראה (אופציונלי)
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
          onChange={(e) => setReferenceVideoFile(e.target.files?.[0] ?? null)}
        />
        <small className="muted">
          המערכת תנתח את הסגנון, הצבעוניות, קצב החיתוכים, המצלמה ומבנה הסיפור. הסרטון לא ישולב בתוצר ולא יועתק.
          עד 15MB.
        </small>
        {referenceVideoFile ? (
          <span className="upload-status">
            סרטון לניתוח: {referenceVideoFile.name}
            <button
              type="button"
              className="link-btn"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setReferenceVideoFile(null);
              }}
            >
              הסר
            </button>
          </span>
        ) : null}
      </label>
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
          </div>
        </details>
      </section>
      <section className="create-topic-card basic-settings-section" aria-labelledby="basic-settings-heading">
        <div className="form-section-heading">
          <span className="form-section-icon" aria-hidden>◎</span>
          <div>
            <h2 id="basic-settings-heading">הגדרות בסיסיות</h2>
            <p>הבחירות הנפוצות שמשפיעות על אורך הסרטון, הפורמט והחוויה.</p>
          </div>
        </div>
        <fieldset className="choice-fieldset duration-picker">
          <legend>משך הסרטון</legend>
          <div className="choice-chips">
            {[15, 30, 45, 60].map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={durationSeconds === seconds ? "is-selected" : ""}
                onClick={() => setDurationSeconds(seconds)}
              >
                {seconds} שנ׳ {seconds === 30 ? <small>מומלץ</small> : null}
              </button>
            ))}
            <label className={![15, 30, 45, 60].includes(durationSeconds) ? "custom-duration is-selected" : "custom-duration"}>
              מותאם
              <input
                type="number"
                min={5}
                max={180}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Math.min(180, Math.max(5, Number(e.target.value) || 30)))}
              />
            </label>
          </div>
          <small className="field-help">משך ארוך יותר יגדיל את מספר הסצנות, זמן הייצור והעלות.</small>
        </fieldset>

        <div className="common-fields-grid common-fields-grid-three">
          <label className="field-block">
            פלטפורמה
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="instagram_reels">Instagram Reels</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube_shorts">YouTube Shorts</option>
              <option value="linkedin">LinkedIn</option>
              <option value="youtube">YouTube לרוחב</option>
              <option value="website">אתר / מצגת</option>
            </select>
          </label>
          <label className="field-block">
            שפה
            <select
              value={String(creative.language ?? "עברית")}
              onChange={(e) => setCreativeField("language", e.target.value as never)}
            >
              {["עברית", "אנגלית", "ערבית", "רוסית", "צרפתית", "ספרדית", "יידיש"].map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>
          </label>
          <label className="field-block">
            סוג הסרטון
            <select
              value={String(creative.filmTemplate ?? "social_explainer")}
              onChange={(e) => setCreativeField("filmTemplate", e.target.value as never)}
            >
              <option value="social_explainer">סרטון הסברה לרשתות</option>
              <option value="product_demo">הדגמת מוצר</option>
              <option value="testimonial">סיפור לקוח</option>
              <option value="public_service_explainer">שירות ציבורי</option>
              <option value="corporate_product">סרט מוצר B2B</option>
            </select>
          </label>
          <label className="field-block">
            דיבור
            <select value={narrationMode} onChange={(e) => setNarrationMode(e.target.value)}>
              <option value="voiceover">קריינות חיצונית</option>
              <option value="dialogue">שיחה בין דמויות</option>
              <option value="lip_sync">דמות מדברת עם סנכרון שפתיים</option>
              <option value="none">ללא דיבור</option>
            </select>
          </label>
          <label className="field-block">
            מוזיקה
            <select value={musicMode} onChange={(e) => setMusicMode(e.target.value)}>
              <option value="auto">אוטומטית לפי האווירה</option>
              <option value="calm">רגועה</option>
              <option value="energetic">אנרגטית</option>
              <option value="none">ללא מוזיקה</option>
            </select>
          </label>
          <label className="field-block">
            כתוביות
            <select
              value={String(creative.karaokeCaptions ?? "on")}
              onChange={(e) => setCreativeField("karaokeCaptions", e.target.value as never)}
            >
              <option value="on">כתוביות פעילות</option>
              <option value="off">ללא כתוביות</option>
            </select>
          </label>
        </div>

        <details className="cost-details">
          <summary>
            <span>עלות משוערת</span>
            <strong>{freeLeft > 0 ? "סרטון חינם" : "קרדיט אחד"}</strong>
          </summary>
          <p title={`${costEstimate.videoModelDisplay} · $${costEstimate.perSecondUsd.toFixed(3)}/s`}>
            עלות הפקה משוערת למערכת: {formatCostNis(costEstimate.nis)} · {costEstimate.videoProviderLabel} · כ־
            {costEstimate.veoSeconds} שניות וידאו.
          </p>
        </details>
      <fieldset className="approval-fieldset approval-card-picker">
        <legend>מצב יצירה</legend>
        <label>
          <input type="radio" checked={approvalMode === "auto"} onChange={() => setApprovalMode("auto")} />
          <span><strong>יצירה אוטומטית</strong><small>המערכת תכין את הסרטון המלא לפי ההגדרות. · שליטה בסיסית</small></span>
        </label>
        <label>
          <input
            type="radio"
            checked={approvalMode === "auto_until_render"}
            onChange={() => setApprovalMode("auto_until_render")}
          />
          <span><strong>תסריט וסקיצה לפני יצירה — מומלץ</strong><small>תראו את התסריט, הסצנות והקריינות לפני הרינדור. · שליטה מאוזנת</small></span>
        </label>
        <label>
          <input type="radio" checked={approvalMode === "manual"} onChange={() => setApprovalMode("manual")} />
          <span><strong>אישור בכל שלב</strong><small>מתאים למי שרוצה שליטה מלאה בתהליך. · שליטה מרבית</small></span>
        </label>
      </fieldset>
      </section>

      <details className="branding-section optional-disclosure">
        <summary>
          <span className="form-section-icon" aria-hidden>✦</span>
          <span><strong>מיתוג העסק</strong><small>שם, סלוגן, אתר ולוגו — רק אם הסרטון מייצג מותג</small></span>
          <span className="disclosure-status">{businessName || logoFile ? "הוגדר" : "לא חובה"}</span>
        </summary>
        <div className="optional-disclosure-body">
        <div className="form-section-heading">
          <span className="form-section-icon" aria-hidden>✦</span>
          <div>
            <h2 className="branding-section-title">מיתוג העסק</h2>
            <p className="muted branding-hint">שם, סלוגן, קישור ולוגו שיופיעו בכרטיס הסיום.</p>
          </div>
        </div>
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
            type="url"
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
        </div>
      </details>

      <details
        className="advanced-disclosure"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span className="form-section-icon" aria-hidden>⚙</span>
          <span><strong>הגדרות מתקדמות</strong><small>שליטה מקצועית בסגנון, תסריט, קול, צילום ועריכה</small></span>
          <span className="disclosure-status">לא חובה</span>
        </summary>
        <div className="advanced-panel">
          <div className="advanced-presets-head">
            <div>
              <h3>תבניות סגנון מהירות</h3>
              <p>בחירה אחת תעדכן מספר הגדרות מקצועיות יחד.</p>
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
                setVideoGoal("פרסום מוצר");
              }}
            >
              <strong>פרסומת מוצר</strong><small>מוצר, יתרונות וקריאה לפעולה</small>
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
              <strong>B2B מקצועי</strong><small>בעיה, מוצר, יתרונות ו־CTA</small>
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
              <strong>סיפור אישי</strong><small>בעיה, חוויה ושינוי</small>
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
              <strong>חדשות ועדכון</strong><small>מגיש, כותרות ומסר ברור</small>
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
              <strong>סרטון לרשתות</strong><small>Hook מהיר, הסבר ופעולה</small>
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
                        <option value="">אוטומטי — לפי הבריף והאווירה</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>{option.labelHe}</option>
                        ))}
                      </select>
                    )}
                  </label>
                ))}
                {group.id === "voice" && (narrationMode === "lip_sync" || visualFiles.length > 0) ? (
                  <p className={heygenNeedsAnchor ? "error-inline accordion-note" : "muted accordion-note"}>
                    סנכרון שפתיים דורש תמונת דמות ומוסיף עלות רינדור. ברירת המחדל היא אוטומטית.
                  </p>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </details>

      {error ? <p className="error-inline">{error}</p> : null}
      <div className="stage-actions create-actions">
        <div className="creation-summary-metrics">
          <span><small>עלות</small><strong>{freeLeft > 0 ? "סרטון חינם" : "קרדיט אחד"}</strong></span>
          <span><small>זמן משוער</small><strong>{estimatedMinutesMin}–{estimatedMinutesMax} דקות</strong></span>
          <span className={requiredComplete === 3 ? "is-ready" : ""}>
            <small>סטטוס מילוי</small>
            <strong>{requiredComplete === 3 ? "מוכן ליצירת סקיצה" : `חסר: ${requiredMissing.join(", ")}`}</strong>
          </span>
        </div>
        <div className="creation-summary-actions">
          <button type="button" className="button-secondary" onClick={() => setDraftSavedAt(new Date())}>
            שמירת טיוטה
          </button>
          <details className="creation-summary-popover">
            <summary>תצוגת סיכום</summary>
            <div>
              <strong>{title || "ללא כותרת"}</strong>
              <span>{videoGoal || "לא נבחרה מטרה"} · {durationSeconds} שנ׳ · {platform}</span>
              <span>{targetAudience || "קהל יעד אוטומטי"} · {moods.join(", ") || "אווירה אוטומטית"}</span>
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
          {busy ? "מכין תסריט וסקיצה…" : "יצירת תסריט וסקיצה"}
          {!busy ? <span aria-hidden>←</span> : null}
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