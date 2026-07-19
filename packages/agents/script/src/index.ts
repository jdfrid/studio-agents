import { geminiCompleteJson, llmCompleteJson } from "@studio/providers";
import {
  BriefOutputSchema,
  NoProviderConfiguredError,
  ScriptInputSchema,
  ScriptOutputSchema,
  forcedVeoDurationBucket,
  isBudgetMode,
  targetSceneSeconds,
  type Agent,
  type BriefOutput,
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
    const sceneTargetSeconds = targetSceneSeconds(budget);
    const sceneCount = Math.max(1, Math.round(brief.durationSeconds / sceneTargetSeconds));

    const system =
      "You are a senior script writer for short vertical promotional videos. Generate a tight, scene-by-scene timeline. Keep each narration under 120 characters. Keep visualPrompt and veoPrompt under 200 characters each. CRITICAL: all scenes must share the SAME location, characters, wardrobe, and color palette. Each veoPrompt must explicitly continue from the previous scene without changing setting.";
    const schemaHint = JSON.stringify(
      {
        scenes: [
          {
            title: "short Hebrew title",
            narration: `${brief.language} narration, 1-2 short sentences`,
            visualPrompt: "English directive for the visual: subject, action, framing, mood, lighting",
            veoPrompt: "Concise English prompt for Veo video generation (subject, camera movement, action, mood)",
            referenceImagePrompt: "Prompt for a still reference frame (optional but recommended)",
            firstFramePrompt: "Prompt for first frame when continuity matters (optional)",
            lastFramePrompt: "Prompt for last frame when continuity matters (optional)",
            durationBucket: "4 | 6 | 8",
            audioPolicy: "gemini_tts_plus_music | gemini_tts_only | veo_native_audio | muted",
            durationSeconds: `integer; should sum to ~${brief.durationSeconds}`,
            requiredAssets: ["voice", "music", "video"]
          }
        ],
        musicPrompt: "English directive for the music feel and tempo",
        backgroundVisualPrompt: "English overall visual direction"
      },
      null,
      2
    );

    const userPrompt = `Brief:\n${JSON.stringify(brief, null, 2)}\n\nProduce exactly ${sceneCount} scenes of roughly ${sceneTargetSeconds}s each, summing to ${brief.durationSeconds}s.${budget ? " Budget mode: keep scenes concise; narration must fit short 4s video clips." : ""}`;

    const completeJson = provider.type === "GEMINI" ? geminiCompleteJson : llmCompleteJson;
    const { parsed, model } = await completeJson<{
      scenes: Omit<SceneSpec, "id" | "order">[];
      musicPrompt: string;
      backgroundVisualPrompt: string;
    }>(provider, {
      system,
      user: userPrompt,
      schemaName: "ScriptOutput",
      schemaHint,
      temperature: 0.5,
      maxOutputTokens: 8192
    });

    const scenes: SceneSpec[] = (parsed.scenes ?? []).slice(0, 60).map((scene, index) => {
      const durationBucket = normalizeDurationBucket(scene.durationBucket, scene.durationSeconds ?? sceneTargetSeconds, budget);
      const includeExtraFrames = !budget;
      return {
        id: nanoid(10),
        order: index,
        title: scene.title ?? `Scene ${index + 1}`,
        narration: scene.narration ?? "",
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
      metadata: { provider: provider.provider, model, sceneCount: scenes.length }
    });
    await ctx.log.log("script_done", "Script Agent finished", { sceneCount: scenes.length, totalDurationSeconds });
    return output;
  }
};

function normalizeDurationBucket(value: unknown, durationSeconds: number, budget: boolean): "4" | "6" | "8" {
  const forced = forcedVeoDurationBucket();
  if (forced) return forced;
  if (value === "4" || value === "6" || value === "8") return budget ? "4" : value;
  if (budget || durationSeconds <= 4) return "4";
  if (durationSeconds <= 6) return "6";
  return "8";
}
