import { geminiCompleteJson, llmCompleteJson } from "@studio/providers";
import {
  BriefOutputSchema,
  NoProviderConfiguredError,
  ScriptInputSchema,
  ScriptOutputSchema,
  applyContinuityToScript,
  contentLanguageEnglishName,
  contentLanguageNativeName,
  formatCreativeConstraints,
  forcedVeoDurationBucket,
  isBudgetMode,
  isCorporateProductFilm,
  isProductAdBrief,
  narrationCharLimitForBucket,
  normalizeContentLanguage,
  planSceneLayout,
  profileToProductionCostConfig,
  resolveRenderProfile,
  sanitizeVeoPromptForExternalAudio,
  userFacingLanguageInstruction,
  type Agent,
  type AgentContext,
  type ScriptInput,
  type ScriptOutput,
  type SceneSpec
} from "@studio/shared";
import { nanoid } from "nanoid";

export const scriptAgent: Agent<ScriptInput, ScriptOutput> = {
  name: "script",
  inputSchema: ScriptInputSchema,
  outputSchema: ScriptOutputSchema,
  async run(ctx, input) {
    const brief = BriefOutputSchema.parse(input.brief);
    await ctx.log.log("script_start", "Script Agent started", { title: brief.title });

    const provider = (await ctx.providers.primary("GEMINI")) ?? (await ctx.providers.primary("LLM"));
    if (!provider) throw new NoProviderConfiguredError("GEMINI");

    const budget = isBudgetMode(brief);
    const renderProfile = resolveRenderProfile(brief);
    const costConfig = profileToProductionCostConfig(renderProfile);
    const { sceneCount, clipSeconds, totalVideoSeconds } = planSceneLayout(brief.durationSeconds, budget, costConfig);
    const narrationLimit = narrationCharLimitForBucket(clipSeconds);
    const productAd = isProductAdBrief({
      ...brief,
      creative: (brief as { creative?: { filmTemplate?: string; designStyle?: string } }).creative
    });
    const corporateFilm = isCorporateProductFilm({
      creative: (brief as { creative?: { filmTemplate?: string; designStyle?: string } }).creative
    });
    const filmTemplate = brief.creative?.filmTemplate;
    const extendMode = renderProfile.strategy === "extend";
    const klingMode = renderProfile.provider === "kling";
    const lipSyncMode = renderProfile.capabilities.nativeAudio === true;
    const beatI2vMode = klingMode || lipSyncMode || renderProfile.provider === "fal";
    const contentLang = normalizeContentLanguage(brief.language);
    const langEn = contentLanguageEnglishName(contentLang);
    const langNative = contentLanguageNativeName(contentLang);

    const systemParts = [
      "You are a senior script writer for short vertical promotional videos. Generate a tight, scene-by-scene timeline.",
      userFacingLanguageInstruction(contentLang),
      contentLang === "yi"
        ? "NARRATION MUST be Yiddish (ייִדיש), not Modern Israeli Hebrew. Prefer Yiddish wording even when the brief summary drifted into Hebrew."
        : "",
      brief.visualAnchors?.length
        ? `User uploaded ${brief.visualAnchors.length} CHARACTER PHOTO(s). Those people ARE the cast — describe them in characterBible from the photos (gender, age, hair, skin, outfit). visualPrompt/referenceImagePrompt must keep those exact identities; do not invent different faces.`
        : "",
      `Keep each narration under ${narrationLimit} characters (must fit ${clipSeconds}s of spoken audio) in ${langEn}.`,
      "Keep visualPrompt and veoPrompt under 200 characters each.",
      "CRITICAL: all scenes must share the SAME location, characters, wardrobe, and color palette.",
      `Output characterBible in ${langEn}: a fixed description of each character (gender, age, hair, skin tone, outfit) and the single location — this NEVER changes between scenes. Explicitly state each character's gender (male/female or זכר/נקבה).`,
      "Each veoPrompt must explicitly continue from the previous scene without changing setting or cast.",
      brief.visualAnchors?.length
        ? "Uploaded photos define the cast identity — keep those faces. Still avoid naming real celebrities in text prompts."
        : "NEVER name real celebrities, politicians, or other recognizable public figures in veoPrompt, visualPrompt, or characterBible — use generic fictional people only (video models block real-person likenesses).",
      "Avoid coded public-figure descriptions (e.g. Israeli leader / US president / named office holders). Describe age, hair, and wardrobe only for fictional characters.",
      "NO UNSOLICITED GRAPHICS: do not invent wall maps, globes, news tickers, lower-thirds, or on-screen data overlays unless the user brief explicitly asks for them.",
      "NARRATION–MOTION SYNC (mandatory): narration and veoPrompt are one timed beat — write them together.",
      "NARRATION TONE (mandatory): every spoken line must match the event mood and creative style — not generic announcer copy.",
      "If creative/communicationStyle/designStyle/location/targetAudience are set, narration vocabulary and energy MUST reflect them (e.g. wedding warmth, news urgency, kids playful, Pixar whimsy).",
      "Do not write flat product-demo narration when the brief describes a ceremony, party, documentary, or stylized world.",
      lipSyncMode
        ? "In veoPrompt, describe body/gaze/gesture timed to the spoken line; mouth sync comes from lip-sync audio. With 2+ people on screen, only the active speaker (speakerName) should mouth words; others listen with closed mouth."
        : "CRITICAL (TTS mix): veoPrompt must be SILENT performance only — closed mouth, no speaking, no dialogue, no music, no lip-sync/mouthing words. Voiceover is added later via TTS+FFmpeg; asking Veo for speech often fails the whole clip. With 2+ people: only speakerName shows mild expression; everyone else listens with a fully closed mouth and no lip motion.",
      "If narration is empty or muted, veoPrompt must say silent performance — closed mouth, no speaking gestures.",
      lipSyncMode
        ? "Pace gestures to the line: open with attention, hold product/gesture mid-line, end with a clear hold — avoid frantic action that fights the voiceover."
        : "Pace gestures to the silent beat: face camera / look at product, natural blinks, hold product mid-beat — avoid frantic action.",
      "Optionally include 0–1 title_card scenes (sceneKind=title_card): short on-screen CTA/headline, empty narration, audioPolicy muted, durationSeconds 3–5, visualPrompt describes full-frame kinetic text background.",
      "Spoken beat scenes use sceneKind=beat (default). Keep dubbing lines short, conversational, and timed to the beat.",
      "DIALOGUE DUBBING (mandatory when cast has 2+ speaking characters): alternate speakers across consecutive beat scenes.",
      "Set speaker to \"a\" or \"b\" and speakerName to the character's short name from characterBible.",
      "narration must be ONLY the spoken words for that character — clear natural dialogue, no 'Name:' prefixes, no stage directions.",
      "Alternate a/b so the audio engine can use two distinct TTS voices. Use speaker \"narrator\" only for non-dialogue VO — prefer a/b when two people are conversing.",
      "VISUAL DISCUSSION (mandatory for 2+ cast): this must LOOK like a conversation, not two solo monologues and not a choir.",
      "Prefer over-the-shoulder or medium close-up on the ACTIVE speaker; the listener can be partly visible but must have a fully closed mouth and no lip motion.",
      "Avoid framing where both faces are equally large and both mouths move — that reads as speaking in chorus.",
      "Every visualPrompt and veoPrompt must name both characters and who is speaking vs listening (listener still, closed mouth).",
      "Write back-and-forth discussion lines (question/answer, agreement/pushback) — not one long announcer speech split across scenes.",
      "CRITICAL AUDIO: each narration is ONLY one character's spoken words for that beat — never put both characters' lines in the same narration (no overlapping dialogue, no chorus).",
      "WARDROBE LOCK: coat/jacket/shirt colors and outfits stay identical in every scene — do not invent new clothing colors.",
      contentLang === "he" || contentLang === "yi"
        ? "HEBREW NIKUD (mandatory): every narration line MUST include full niqqud (ניקוד) for correct TTS pronunciation and stress — e.g. שָׁלוֹם not שלום."
        : contentLang === "ar"
          ? "ARABIC: use clear vocalization where needed for correct TTS pronunciation."
          : "",
      "Return strictly valid JSON only — escape quotes inside strings, no trailing commas, no markdown."
    ].filter(Boolean);
    if (extendMode) {
      systemParts.push(
        "VEO EXTEND MODE: produce story beats (not independent clips). Beat 1 is the opening Veo generation; beats 2+ extend the same continuous shot — veoPrompt must describe what happens next in the same scene, same camera, no hard cut.",
        `Each beat targets ${clipSeconds}s of story/render time in a single extend chain.`
      );
    }
    if (klingMode) {
      systemParts.push(
        "KLING I2V MODE: each beat is an independent 10s clip generated from its reference still frame. Keep visual continuity via referenceImagePrompt; veoPrompt describes motion and camera for image-to-video.",
        `Each beat targets ${clipSeconds}s of story time.`
      );
    }
    if (lipSyncMode) {
      systemParts.push(
        "LIP-SYNC MODE (Kling Avatar / HeyGen): each beat is a talking-head clip from a reference still with true lip-sync to the scene narration audio.",
        "veoPrompt is a short motion_prompt (body/gesture only — mouth sync comes from audio). Prefer facing camera, natural head nods, hand gestures that match the spoken line.",
        `Narration must be clear spoken lines in ${langEn} (this audio drives lip-sync). Keep visual continuity via referenceImagePrompt.`,
        `Each beat targets ~${clipSeconds}s of story time.`
      );
    }
    if (filmTemplate === "social_explainer") {
      systemParts.push(
        "SOCIAL EXPLAINER TEMPLATE: structure the timeline as immediate visual Hook → relatable Problem → 2–3 concrete visual explanations/demonstrations → clear Solution → concise CTA.",
        "Show the claimed guidance through actions, comparisons and close-ups. Keep each beat understandable without audio; captions are added in packaging, so never ask the video model to render text."
      );
    }
    if (filmTemplate === "public_service_explainer") {
      systemParts.push(
        "PUBLIC-SERVICE EXPLAINER: structure as Situation → Risk or common mistake → practical checks/rules → correct behavior → authoritative closing message.",
        "Use calm, trustworthy narration and literal visual demonstrations. Do not invent statistics, medical claims, government marks or institutional logos."
      );
    }
    if (filmTemplate === "product_demo") {
      systemParts.push(
        "PRODUCT DEMO TEMPLATE: structure as Problem → Product reveal → step-by-step use → 2–3 observable benefits → resolved outcome → CTA.",
        "Use close-ups and hands-on demonstrations; when product plates exist, preserve the exact uploaded product."
      );
    }
    if (filmTemplate === "testimonial") {
      systemParts.push(
        "TESTIMONIAL TEMPLATE: structure as personal Before/problem → discovery → specific experience → After/result → honest recommendation.",
        "Do not invent measurable customer results or imply a real testimonial unless the brief provides them."
      );
    }
    if (corporateFilm) {
      systemParts.push(
        "CORPORATE PRODUCT FILM (B2B / HighsecLabs-style): structure the timeline as Hook → Problem → Product hero → Benefits → CTA.",
        "Prefer professional VO (speaker narrator), clean product/facility visuals, and short authoritative narration — not cartoon dialogue or news-desk banter.",
        "When product photos are provided, every product-hero beat must show that exact product (locked plate); do not invent a different device.",
        "Scene titles should be short lower-third labels (e.g. Problem, Product, Benefit, CTA)."
      );
    } else if (productAd) {
      systemParts.push(
        "PRODUCT AD: use a clear arc — hook (attention) → product hero (show packaging clearly, hold up product) → kids/audience reaction and CTA.",
        "The product or brand name from the brief MUST appear in narration and veoPrompt wherever the product or packaging is visible.",
        extendMode
          ? "Narration must be short punchy lines that fit each 10s beat."
          : "Narration must be ultra-short punchy lines (~12 words max for 4s clips)."
      );
    }
    const system = systemParts.join(" ");

    const includeExtraFrames = !budget && !extendMode && !beatI2vMode;
    const sceneSchema: Record<string, unknown> = {
      title: `short ${langNative} title`,
      narration: `${langNative} narration, 1 short sentence (max ${narrationLimit} chars); empty string if sceneKind=title_card`,
      visualPrompt:
        "English visual: for 2+ cast prefer two-shot both people visible; name speaker vs listener (max 200 chars)",
      veoPrompt: lipSyncMode
        ? "English lip-sync motion prompt: body/gaze/gesture timed to narration (max 200 chars)"
        : "English motion prompt timed to narration (speaking vs silent, gaze, gestures; max 200 chars)",
      durationBucket: "4 | 6 | 8",
      audioPolicy: lipSyncMode
        ? "gemini_tts_only"
        : "gemini_tts_plus_music | gemini_tts_only | veo_native_audio | muted",
      durationSeconds: clipSeconds,
      requiredAssets: ["voice", "music", "video"],
      sceneKind: "beat | title_card",
      speaker: "a | b | narrator — alternate a/b for dialogue",
      speakerName: "short character name for this spoken line"
    };
    if (includeExtraFrames) {
      sceneSchema.referenceImagePrompt = "optional English reference still prompt";
      sceneSchema.firstFramePrompt = "optional English";
      sceneSchema.lastFramePrompt = "optional English";
    } else if (beatI2vMode) {
      sceneSchema.referenceImagePrompt = "optional English reference still prompt";
    }

    const schemaHint = JSON.stringify(
      {
        scenes: [sceneSchema],
        musicPrompt: `${langNative} music feel`,
        backgroundVisualPrompt: `${langNative} single location visual direction`,
        characterBible: `${langNative} locked cast + location (never changes)`
      },
      null,
      2
    );

    const adHint = corporateFilm
      ? " Corporate B2B film: Hook→Problem→Product→Benefits→CTA; product plates stay locked; professional narrator VO."
      : productAd
        ? " Product-ad brief: include brand/product name, packaging hero shot, and excited reaction."
        : "";
    const extendHint = extendMode
      ? ` Veo extend mode: ${sceneCount} beats in one continuous chain (~${totalVideoSeconds}s billed Veo time).`
      : lipSyncMode
        ? ` HeyGen lip-sync mode: ${sceneCount} beats × ~${clipSeconds}s each (reference still + narration audio per beat).`
        : klingMode
          ? ` Kling I2V mode: ${sceneCount} beats × ~10s each (reference frame per beat).`
          : "";
    const creativeLines = formatCreativeConstraints(
      (brief as { creative?: Parameters<typeof formatCreativeConstraints>[0] }).creative
    );
    const creativeBlock =
      creativeLines.length > 0
        ? `\n\nCreative constraints (MUST shape narration tone + visuals):\n${creativeLines.map((l) => `- ${l}`).join("\n")}`
        : "";
    const toneHint = [
      brief.toneOfVoice ? `Brief toneOfVoice: ${brief.toneOfVoice}` : "",
      brief.style ? `Brief style: ${brief.style}` : "",
      brief.summary ? `Brief summary: ${String(brief.summary).slice(0, 280)}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    const userPrompt = `Brief:\n${JSON.stringify(brief, null, 2)}${creativeBlock}${toneHint ? `\n\n${toneHint}` : ""}\n\nProduce exactly ${sceneCount} scenes of ${clipSeconds}s each (story beat length). Total video length will be ~${totalVideoSeconds}s (brief asks for ${brief.durationSeconds}s). User-facing text (titles, narration, characterBible, backgroundVisualPrompt, musicPrompt) MUST be in ${langEn}. Narration must sound like it belongs to this specific event/style (not generic ads). For every scene, align narration wording with the motion described in veoPrompt.${budget ? " Budget mode: narration must fit short clips; no first/last frame prompts needed." : ""}${adHint}${extendHint}`;

    const completeJson = provider.type === "GEMINI" ? geminiCompleteJson : llmCompleteJson;
    const { parsed, model } = await completeJson<{
      scenes: Array<Partial<Omit<SceneSpec, "id" | "order">> & { title?: string; narration?: string }>;
      musicPrompt: string;
      backgroundVisualPrompt: string;
      characterBible?: string;
    }>(
      provider,
      {
        system,
        user: userPrompt,
        schemaName: "ScriptOutput",
        schemaHint,
        temperature: 0.5,
        maxOutputTokens: 8192
      },
      async (event) => {
        await ctx.cost.record(event);
      }
    );

    const rawScenes = [...(parsed.scenes ?? [])];
    if (rawScenes.length !== sceneCount) {
      await ctx.log.log("script_scene_count_mismatch", "LLM returned different scene count than planned", {
        planned: sceneCount,
        received: rawScenes.length
      });
    }

    // Pad short scripts so final length does not undershoot the brief.
    while (rawScenes.length > 0 && rawScenes.length < sceneCount) {
      const src = rawScenes[rawScenes.length - 1]!;
      rawScenes.push({
        ...src,
        title: `${String(src.title ?? "Beat")} (cont.)`,
        narration: String(src.narration ?? "").trim()
          ? String(src.narration)
          : paddedNarrationFallback(contentLang),
        speaker: (rawScenes.length % 2 === 0 ? "a" : "b") as "a" | "b"
      });
    }

    const scenes: SceneSpec[] = rawScenes.slice(0, sceneCount).map((scene, index) => {
      const durationBucket = normalizeDurationBucket(
        scene.durationBucket,
        clipSeconds,
        budget,
        extendMode,
        beatI2vMode
      );
      const includeExtraFrames = !budget && !extendMode && !beatI2vMode;
      // Title cards are FFmpeg-only; skip in continuous extend chains.
      const resolvedKind = extendMode ? "beat" : scene.sceneKind === "title_card" ? "title_card" : "beat";
      const narrationRaw = resolvedKind === "title_card" ? (scene.narration ?? "").trim() : (scene.narration ?? "");
      const narration =
        resolvedKind === "title_card"
          ? narrationRaw.slice(0, narrationLimit)
          : trimNarration(
              stripSpeakerPrefix(narrationRaw),
              narrationCharLimitForBucket(extendMode || beatI2vMode ? clipSeconds : Number(durationBucket))
            );
      const speakerRaw = String((scene as { speaker?: string }).speaker ?? "").toLowerCase();
      const dialogueCast = Boolean(brief.visualAnchors && brief.visualAnchors.length >= 2);
      const speaker =
        resolvedKind === "title_card"
          ? undefined
          : speakerRaw === "a" || speakerRaw === "b" || speakerRaw === "narrator"
            ? (speakerRaw as "a" | "b" | "narrator")
            : dialogueCast
              ? ((index % 2 === 0 ? "a" : "b") as "a" | "b")
              : ("narrator" as const);
      const speakerName =
        resolvedKind === "title_card"
          ? undefined
          : String((scene as { speakerName?: string }).speakerName ?? "").trim().slice(0, 80) || undefined;
      const veoPromptRaw =
        scene.veoPrompt?.trim() ||
        scene.visualPrompt?.trim() ||
        (resolvedKind === "title_card" ? "Static full-frame title card, subtle fade-in text" : "");
      const veoPrompt =
        lipSyncMode || resolvedKind === "title_card"
          ? veoPromptRaw
          : sanitizeVeoPromptForExternalAudio(veoPromptRaw);
      return {
        id: nanoid(10),
        order: index,
        title: scene.title ?? `Scene ${index + 1}`,
        narration,
        visualPrompt:
          scene.visualPrompt?.trim() ||
          (resolvedKind === "title_card"
            ? "Full-frame kinetic text card, dark studio backdrop, bold white Hebrew headline"
            : ""),
        veoPrompt,
        referenceImagePrompt: scene.referenceImagePrompt ?? scene.visualPrompt ?? undefined,
        firstFramePrompt: includeExtraFrames ? (scene.firstFramePrompt ?? scene.visualPrompt ?? undefined) : scene.firstFramePrompt,
        lastFramePrompt: includeExtraFrames ? (scene.lastFramePrompt ?? scene.visualPrompt ?? undefined) : scene.lastFramePrompt,
        durationBucket,
        audioPolicy:
          resolvedKind === "title_card" ? "muted" : lipSyncMode ? "gemini_tts_only" : resolveSceneAudioPolicy(scene.audioPolicy, budget),
        durationSeconds:
          resolvedKind === "title_card"
            ? Math.min(5, Math.max(3, Number(scene.durationSeconds) || 4))
            : extendMode || beatI2vMode
              ? clipSeconds
              : Number(durationBucket),
        requiredAssets:
          resolvedKind === "title_card"
            ? ["music"]
            : scene.requiredAssets?.length
              ? scene.requiredAssets
              : ["voice", "music", "video"],
        sceneKind: resolvedKind,
        ...(speaker ? { speaker } : {}),
        ...(speakerName ? { speakerName } : {})
      };
    });

    if (scenes.length === 0) {
      throw new Error("Script Agent produced no scenes");
    }

    if (contentLang === "he" || contentLang === "yi") {
      await applyHebrewNiqqud(scenes, provider, completeJson, ctx);
    }

    const totalDurationSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    const output: ScriptOutput = applyContinuityToScript(
      {
        scenes,
        totalDurationSeconds,
        musicPrompt: parsed.musicPrompt ?? brief.musicDirection ?? "",
        backgroundVisualPrompt: parsed.backgroundVisualPrompt ?? brief.visualDirection ?? "",
        characterBible: parsed.characterBible ?? "",
        geminiModel: provider.type === "GEMINI" ? model : undefined
      },
      parsed.characterBible,
      { hasUserCharacterPhotos: Boolean(brief.visualAnchors?.length) }
    );

    await ctx.artifacts.save({
      runId: ctx.runId,
      stage: "script",
      kind: "script_output",
      body: JSON.stringify(output, null, 2),
      mimeType: "application/json",
      filename: "script.json",
      metadata: {
        provider: provider.provider,
        model,
        sceneCount: scenes.length,
        clipSeconds,
        briefDurationSeconds: brief.durationSeconds,
        productAd,
        renderProfile: renderProfile.id
      }
    });
    await ctx.log.log("script_done", "Script Agent finished", {
      sceneCount: scenes.length,
      totalDurationSeconds,
      clipSeconds,
      briefDurationSeconds: brief.durationSeconds
    });
    return output;
  }
};

function paddedNarrationFallback(contentLanguage: string): string {
  switch (contentLanguage) {
    case "en":
      return "We continue the conversation in the same place.";
    case "yi":
      return "מ׳גייט ווײַטער מיטן שמועס אויפֿן זעלבן אָרט.";
    case "fr":
      return "Nous poursuivons la conversation au même endroit.";
    case "ar":
      return "نُوَاصِلُ الحِوَارَ فِي المَكَانِ نَفْسِهِ.";
    case "ru":
      return "Мы продолжаем разговор в том же месте.";
    case "es":
      return "Continuamos la conversación en el mismo lugar.";
    default:
      return "מַמְשִׁיכִים אֶת הַשִּׂיחָה בְּאוֹתוֹ מָקוֹם.";
  }
}

function resolveSceneAudioPolicy(
  policy: string | undefined,
  budget: boolean
): "gemini_tts_plus_music" | "gemini_tts_only" | "veo_native_audio" | "muted" {
  if (budget) return "gemini_tts_only";
  // Veo native audio is opt-in only — default pipeline uses Gemini TTS + FFmpeg mix.
  if (policy === "veo_native_audio" && process.env.GEMINI_VEO_AUDIO !== "1") {
    return "gemini_tts_plus_music";
  }
  if (policy === "gemini_tts_only" || policy === "veo_native_audio" || policy === "muted" || policy === "gemini_tts_plus_music") {
    return policy;
  }
  return "gemini_tts_plus_music";
}

function trimNarration(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Remove "Name:" / "שם —" prefixes so TTS speaks only dialogue. */
function stripSpeakerPrefix(text: string): string {
  let t = text
    .replace(/^\s*[^:\n]{1,40}\s*[:：]\s*/u, "")
    .replace(/^\s*[^—\n]{1,40}\s*[—–-]\s*/u, "")
    .trim();
  // If the model packed two speakers into one beat, keep only the first utterance.
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && /^[^\n:]{1,40}\s*[:：]/.test(lines[1]!)) {
    t = lines[0]!;
  }
  t = t.replace(/\s+[^\s:]{1,40}\s*[:：]\s+.+$/u, "").trim();
  return t;
}

function hasHebrewNiqqud(text: string): boolean {
  return /[\u05B0-\u05BB\u05C1\u05C2\u05C4\u05C5]/.test(text);
}

async function applyHebrewNiqqud(
  scenes: SceneSpec[],
  provider: Parameters<typeof geminiCompleteJson>[0],
  completeJson: typeof geminiCompleteJson | typeof llmCompleteJson,
  ctx: AgentContext
): Promise<void> {
  const needs = scenes.filter(
    (s) => s.sceneKind !== "title_card" && s.narration.trim() && !hasHebrewNiqqud(s.narration)
  );
  if (!needs.length) return;

  try {
    const { parsed } = await completeJson<{ scenes: Array<{ id: string; narration: string }> }>(provider, {
      system: [
        "You add full Hebrew niqqud (ניקוד) for text-to-speech.",
        "Keep the exact words and meaning — only add vowel points and shin/sin dots.",
        "Do not translate. Do not shorten. Return JSON only."
      ].join(" "),
      user: `${JSON.stringify(
        { scenes: needs.map((s) => ({ id: s.id, narration: s.narration })) },
        null,
        2
      )}\n\nReturn {"scenes":[{"id":"...","narration":"...with niqqud..."}]} for every input scene.`,
      schemaName: "NiqqudNarration",
      schemaHint: JSON.stringify({
        scenes: [{ id: "scene id", narration: "Hebrew with full niqqud" }]
      }),
      temperature: 0.1,
      maxOutputTokens: 4096
    });
    const byId = new Map((parsed.scenes ?? []).map((s) => [s.id, String(s.narration ?? "").trim()]));
    let updated = 0;
    for (const scene of scenes) {
      const next = byId.get(scene.id);
      if (next && hasHebrewNiqqud(next)) {
        scene.narration = next.slice(0, 800);
        updated += 1;
      }
    }
    await ctx.log.log("script_niqqud_applied", "Added Hebrew niqqud for TTS", {
      updated,
      needed: needs.length
    });
  } catch (error) {
    await ctx.log.log("script_niqqud_failed", "Niqqud pass failed — keeping plain narration", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function normalizeDurationBucket(
  value: unknown,
  clipSeconds: number,
  budget: boolean,
  extendMode: boolean,
  beatI2vMode: boolean
): "4" | "6" | "8" {
  const forced = forcedVeoDurationBucket();
  if (forced) return forced;
  if (extendMode || beatI2vMode) return "8";
  if (value === "4" || value === "6" || value === "8") return budget ? "4" : value;
  if (budget || clipSeconds <= 4) return "4";
  if (clipSeconds <= 6) return "6";
  return "8";
}
