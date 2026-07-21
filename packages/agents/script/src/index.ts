import { geminiCompleteJson, llmCompleteJson } from "@studio/providers";
import {
  BriefOutputSchema,
  NoProviderConfiguredError,
  ScriptInputSchema,
  ScriptOutputSchema,
  forcedVeoDurationBucket,
  isBudgetMode,
  isProductAdBrief,
  narrationCharLimitForBucket,
  planSceneLayout,
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
    const { sceneCount, clipSeconds, totalVideoSeconds } = planSceneLayout(brief.durationSeconds, budget);
    const narrationLimit = narrationCharLimitForBucket(clipSeconds);
    const productAd = isProductAdBrief(brief);

    const systemParts = [
      "You are a senior script writer for short vertical promotional videos. Generate a tight, scene-by-scene timeline.",
      `Keep each narration under ${narrationLimit} characters (must fit ${clipSeconds}s of spoken audio).`,
      "Keep visualPrompt and veoPrompt under 200 characters each.",
      "CRITICAL: all scenes must share the SAME location, characters, wardrobe, and color palette.",
      "Each veoPrompt must explicitly continue from the previous scene without changing setting.",
      "NEVER name real celebrities, politicians, or other recognizable public figures in veoPrompt or visualPrompt — use generic fictional people only (Veo blocks real-person likenesses)."
    ];
    if (productAd) {
      systemParts.push(
        "PRODUCT AD: use a clear arc — hook (attention) → product hero (show packaging clearly, hold up product) → kids/audience reaction and CTA.",
        "The product or brand name from the brief MUST appear in narration and veoPrompt wherever the product or packaging is visible.",
        "Narration must be ultra-short punchy lines (~12 words max for 4s clips)."
      );
    }
    const system = systemParts.join(" ");

    const schemaHint = JSON.stringify(
      {
        scenes: [
          {
            title: "short Hebrew title",
            narration: `${brief.language} narration, 1 short sentence (max ${narrationLimit} chars)`,
            visualPrompt: "English directive for the visual: subject, action, framing, mood, lighting",
            veoPrompt: "Concise English prompt for Veo video generation (subject, camera movement, action, mood)",
            referenceImagePrompt: "Prompt for a still reference frame (optional but recommended)",
            firstFramePrompt: "Prompt for first frame when continuity matters (optional)",
            lastFramePrompt: "Prompt for last frame when continuity matters (optional)",
            durationBucket: "4 | 6 | 8",
            audioPolicy: "gemini_tts_plus_music | gemini_tts_only | veo_native_audio | muted",
            durationSeconds: `integer; each scene is ${clipSeconds}s (Veo clip length)`,
            requiredAssets: ["voice", "music", "video"]
          }
        ],
        musicPrompt: "English directive for the music feel and tempo",
        backgroundVisualPrompt: "English overall visual direction"
      },
      null,
      2
    );

    const adHint = productAd
      ? " Product-ad brief: include brand/product name, packaging hero shot, and excited reaction."
      : "";
    const userPrompt = `Brief:\n${JSON.stringify(brief, null, 2)}\n\nProduce exactly ${sceneCount} scenes of ${clipSeconds}s each (Veo clip length). Total video length will be ~${totalVideoSeconds}s (brief asks for ${brief.durationSeconds}s).${budget ? " Budget mode: narration must fit short clips; no first/last frame prompts needed." : ""}${adHint}`;

    const completeJson = provider.type === "GEMINI" ? geminiCompleteJson : llmCompleteJson;
    const { parsed, model } = await completeJson<{
      scenes: Omit<SceneSpec, "id" | "order">[];
      musicPrompt: string;
      backgroundVisualPrompt: string;
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
      const durationBucket = normalizeDurationBucket(scene.durationBucket, clipSeconds, budget);
      const includeExtraFrames = !budget;
      const narration = trimNarration(scene.narration ?? "", narrationCharLimitForBucket(Number(durationBucket)));
      return {
        id: nanoid(10),
        order: index,
        title: scene.title ?? `Scene ${index + 1}`,
        narration,
        visualPrompt: scene.visualPrompt ?? "",
        veoPrompt: scene.veoPrompt ?? scene.visualPrompt ?? "",
        referenceImagePrompt: scene.referenceImagePrompt ?? scene.visualPrompt ?? undefined,
        firstFramePrompt: includeExtraFrames ? (scene.firstFramePrompt ?? scene.visualPrompt ?? undefined) : scene.firstFramePrompt,
        lastFramePrompt: includeExtraFrames ? (scene.lastFramePrompt ?? scene.visualPrompt ?? undefined) : scene.lastFramePrompt,
        durationBucket,
        audioPolicy: budget ? "gemini_tts_only" : (scene.audioPolicy ?? "gemini_tts_plus_music"),
        durationSeconds: Number(durationBucket),
        requiredAssets: scene.requiredAssets?.length ? scene.requiredAssets : ["voice", "music", "video"]
      };
    });

    if (scenes.length === 0) {
      throw new Error("Script Agent produced no scenes");
    }

    const totalDurationSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    const output: ScriptOutput = {
      scenes,
      totalDurationSeconds,
      musicPrompt: parsed.musicPrompt ?? brief.musicDirection ?? "",
      backgroundVisualPrompt: parsed.backgroundVisualPrompt ?? brief.visualDirection ?? "",
      geminiModel: provider.type === "GEMINI" ? model : undefined
    };

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
        productAd
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

function trimNarration(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

function normalizeDurationBucket(value: unknown, clipSeconds: number, budget: boolean): "4" | "6" | "8" {
  const forced = forcedVeoDurationBucket();
  if (forced) return forced;
  if (value === "4" || value === "6" || value === "8") return budget ? "4" : value;
  if (budget || clipSeconds <= 4) return "4";
  if (clipSeconds <= 6) return "6";
  return "8";
}
