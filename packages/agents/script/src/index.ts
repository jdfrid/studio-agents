import { geminiCompleteJson, llmCompleteJson } from "@studio/providers";
import {
  BriefOutputSchema,
  NoProviderConfiguredError,
  ScriptInputSchema,
  ScriptOutputSchema,
  applyContinuityToScript,
  contentLanguageEnglishName,
  contentLanguageNativeName,
  forcedVeoDurationBucket,
  isBudgetMode,
  isProductAdBrief,
  narrationCharLimitForBucket,
  normalizeContentLanguage,
  planSceneLayout,
  profileToProductionCostConfig,
  resolveRenderProfile,
  userFacingLanguageInstruction,
  type Agent,
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
    const productAd = isProductAdBrief(brief);
    const extendMode = renderProfile.strategy === "extend";
    const klingMode = renderProfile.provider === "kling";
    const heygenMode = renderProfile.provider === "heygen";
    const beatI2vMode = klingMode || heygenMode || renderProfile.provider === "fal";
    const contentLang = normalizeContentLanguage(brief.language);
    const langEn = contentLanguageEnglishName(contentLang);
    const langNative = contentLanguageNativeName(contentLang);

    const systemParts = [
      "You are a senior script writer for short vertical promotional videos. Generate a tight, scene-by-scene timeline.",
      userFacingLanguageInstruction(contentLang),
      `Keep each narration under ${narrationLimit} characters (must fit ${clipSeconds}s of spoken audio) in ${langEn}.`,
      "Keep visualPrompt and veoPrompt under 200 characters each.",
      "CRITICAL: all scenes must share the SAME location, characters, wardrobe, and color palette.",
      `Output characterBible in ${langEn}: a fixed description of each character (gender, age, hair, skin tone, outfit) and the single location — this NEVER changes between scenes.`,
      "Each veoPrompt must explicitly continue from the previous scene without changing setting or cast.",
      "NEVER name real celebrities, politicians, or other recognizable public figures in veoPrompt, visualPrompt, or characterBible — use generic fictional people only (video models block real-person likenesses).",
      "Avoid coded public-figure descriptions (e.g. Israeli leader / US president / named office holders). Describe age, hair, and wardrobe only for fictional characters.",
      "NARRATION–MOTION SYNC (mandatory): narration and veoPrompt are one timed beat — write them together.",
      "In veoPrompt, mark speaking vs silent: when the line is spoken, the on-camera character faces camera / looks at product, mouths the words (subtle lip motion), natural blinks; do NOT have them turn away, walk off, or cover their mouth while speaking.",
      "If narration is empty or muted, veoPrompt must say silent performance — closed mouth, no speaking gestures.",
      "Pace gestures to the line: open with attention, hold product/gesture mid-line, end with a clear hold — avoid frantic action that fights the voiceover.",
      "Optionally include 0–1 title_card scenes (sceneKind=title_card): short on-screen CTA/headline, empty narration, audioPolicy muted, durationSeconds 3–5, visualPrompt describes full-frame kinetic text background.",
      "Spoken beat scenes use sceneKind=beat (default). Keep dubbing lines short, conversational, and timed to the beat.",
      "Return strictly valid JSON only — escape quotes inside strings, no trailing commas, no markdown."
    ];
    if (extendMode) {
      systemParts.push(
        "VEO EXTEND MODE: produce story beats (not independent clips). Beat 1 is the opening Veo generation; beats 2+ extend the same continuous shot — veoPrompt must describe what happens next in the same scene, same camera, no hard cut.",
        `Each beat targets ${clipSeconds}s of story time; Veo renders an 8s bucket per API call in a single extend chain.`
      );
    }
    if (klingMode) {
      systemParts.push(
        "KLING I2V MODE: each beat is an independent 10s clip generated from its reference still frame. Keep visual continuity via referenceImagePrompt; veoPrompt describes motion and camera for image-to-video.",
        `Each beat targets ${clipSeconds}s of story time.`
      );
    }
    if (heygenMode) {
      systemParts.push(
        "HEYGEN LIP-SYNC MODE: each beat is a talking-head clip from a reference still with true lip-sync to the scene narration audio.",
        "veoPrompt is a short motion_prompt (body/gesture only — mouth sync comes from audio). Prefer facing camera, natural head nods, hand gestures that match the spoken line.",
        `Narration must be clear spoken lines in ${langEn} (this audio drives lip-sync). Keep visual continuity via referenceImagePrompt.`,
        `Each beat targets ~${clipSeconds}s of story time.`
      );
    }
    if (productAd) {
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
      visualPrompt: "English visual directive for image models (max 200 chars)",
      veoPrompt: heygenMode
        ? "English HeyGen motion prompt: body/gaze/gesture timed to narration (max 200 chars)"
        : "English motion prompt timed to narration (speaking vs silent, gaze, gestures; max 200 chars)",
      durationBucket: "4 | 6 | 8",
      audioPolicy: heygenMode
        ? "gemini_tts_only"
        : "gemini_tts_plus_music | gemini_tts_only | veo_native_audio | muted",
      durationSeconds: clipSeconds,
      requiredAssets: ["voice", "music", "video"],
      sceneKind: "beat | title_card"
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

    const adHint = productAd
      ? " Product-ad brief: include brand/product name, packaging hero shot, and excited reaction."
      : "";
    const extendHint = extendMode
      ? ` Veo extend mode: ${sceneCount} beats in one continuous chain (~${totalVideoSeconds}s billed Veo time).`
      : heygenMode
        ? ` HeyGen lip-sync mode: ${sceneCount} beats × ~${clipSeconds}s each (reference still + narration audio per beat).`
        : klingMode
          ? ` Kling I2V mode: ${sceneCount} beats × ~10s each (reference frame per beat).`
          : "";
    const userPrompt = `Brief:\n${JSON.stringify(brief, null, 2)}\n\nProduce exactly ${sceneCount} scenes of ${clipSeconds}s each (story beat length). Total video length will be ~${totalVideoSeconds}s (brief asks for ${brief.durationSeconds}s). User-facing text (titles, narration, characterBible, backgroundVisualPrompt, musicPrompt) MUST be in ${langEn}. For every scene, align narration wording with the motion described in veoPrompt (who speaks, when they face camera, when mouth/gestures match the line).${budget ? " Budget mode: narration must fit short clips; no first/last frame prompts needed." : ""}${adHint}${extendHint}`;

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

    const rawScenes = parsed.scenes ?? [];
    if (rawScenes.length !== sceneCount) {
      await ctx.log.log("script_scene_count_mismatch", "LLM returned different scene count than planned", {
        planned: sceneCount,
        received: rawScenes.length
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
              narrationRaw,
              narrationCharLimitForBucket(extendMode || beatI2vMode ? clipSeconds : Number(durationBucket))
            );
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
        veoPrompt:
          scene.veoPrompt?.trim() ||
          scene.visualPrompt?.trim() ||
          (resolvedKind === "title_card" ? "Static full-frame title card, subtle fade-in text" : ""),
        referenceImagePrompt: scene.referenceImagePrompt ?? scene.visualPrompt ?? undefined,
        firstFramePrompt: includeExtraFrames ? (scene.firstFramePrompt ?? scene.visualPrompt ?? undefined) : scene.firstFramePrompt,
        lastFramePrompt: includeExtraFrames ? (scene.lastFramePrompt ?? scene.visualPrompt ?? undefined) : scene.lastFramePrompt,
        durationBucket,
        audioPolicy:
          resolvedKind === "title_card" ? "muted" : heygenMode ? "gemini_tts_only" : resolveSceneAudioPolicy(scene.audioPolicy, budget),
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
        sceneKind: resolvedKind
      };
    });

    if (scenes.length === 0) {
      throw new Error("Script Agent produced no scenes");
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
      parsed.characterBible
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
