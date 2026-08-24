import { prisma } from "@studio/infra-prisma";
import { geminiCompleteJson } from "@studio/providers";
import {
  ScriptOutputSchema,
  formatCreativeConstraints,
  narrationCharLimitForBucket,
  type ProjectRunView,
  type ScriptOutput
} from "@studio/shared";
import { createProvidersRepo } from "./repos.js";
import { fromPrismaStage } from "./stageMap.js";
import { audit, invalidateDownstreamAndRerunAudio, recordStageOutput } from "./runService.js";

/**
 * Rewrite scene narrations to match visual prompts + creative tone, then re-queue audio
 * (package/render rebuild; rendered video clips are reused when prompts unchanged).
 */
export async function alignDubbingToVisual(runId: string): Promise<ProjectRunView | null> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId }, include: { stages: true } });
  if (!run) return null;

  const scriptRow = run.stages.find((s) => fromPrismaStage(s.stage) === "script");
  if (!scriptRow?.output) {
    throw new Error("אין תסריט — לא ניתן להתאים דיבוב לוויזואל.");
  }
  const script = ScriptOutputSchema.parse(scriptRow.output);
  const brief = run.brief as {
    language?: string;
    title?: string;
    summary?: string;
    toneOfVoice?: string;
    style?: string;
    creative?: Parameters<typeof formatCreativeConstraints>[0];
  };

  const providers = createProvidersRepo(run.tenantId);
  const gemini = await providers.primary("GEMINI");
  if (!gemini) {
    throw new Error("אין ספק Gemini מוגדר — נדרש להתאמת דיבוב.");
  }

  const creativeLines = formatCreativeConstraints(brief.creative);
  const scenesPayload = script.scenes.map((scene) => ({
    id: scene.id,
    order: scene.order,
    title: scene.title,
    sceneKind: scene.sceneKind,
    durationSeconds: scene.durationSeconds,
    durationBucket: scene.durationBucket,
    currentNarration: scene.narration,
    visualPrompt: scene.visualPrompt,
    veoPrompt: scene.veoPrompt
  }));

  const system = [
    "You rewrite short video voiceover lines so they match the visual event and creative tone.",
    "Keep the same scene ids and count. title_card scenes must keep empty narration.",
    "Each narration must fit the scene duration (short, spoken, natural).",
    "Reflect location/event mood, design style, and communication style — not generic ad copy.",
    "Return strictly valid JSON only."
  ].join(" ");

  const user = JSON.stringify(
    {
      language: brief.language ?? "he",
      title: brief.title,
      summary: brief.summary,
      toneOfVoice: brief.toneOfVoice,
      style: brief.style,
      creativeConstraints: creativeLines,
      scenes: scenesPayload
    },
    null,
    2
  );

  const { parsed } = await geminiCompleteJson<{
    scenes: Array<{ id: string; narration: string }>;
  }>(gemini, {
    system,
    user: `${user}\n\nReturn {"scenes":[{"id":"...","narration":"..."}]} for every scene.`,
    schemaName: "AlignedNarration",
    schemaHint: JSON.stringify({
      scenes: [{ id: "scene id", narration: "rewritten narration or empty for title_card" }]
    }),
    temperature: 0.4,
    maxOutputTokens: 4096
  });

  const byId = new Map((parsed.scenes ?? []).map((s) => [s.id, s.narration ?? ""]));
  const nextScenes = script.scenes.map((scene) => {
    if (scene.sceneKind === "title_card") {
      return { ...scene, narration: "" };
    }
    const rewritten = byId.get(scene.id);
    if (rewritten == null) return scene;
    const limit = narrationCharLimitForBucket(Number(scene.durationBucket) || scene.durationSeconds);
    return { ...scene, narration: String(rewritten).trim().slice(0, limit) };
  });

  const nextScript: ScriptOutput = { ...script, scenes: nextScenes };
  await recordStageOutput(scriptRow.id, nextScript, "COMPLETED");
  await audit(run.tenantId, "align_dubbing_to_visual", "ProjectRun", runId, {
    sceneCount: nextScenes.length
  });

  return invalidateDownstreamAndRerunAudio(runId);
}
