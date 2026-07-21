import {
  PackageInputSchema,
  PackageOutputSchema,
  type Agent,
  type AssetOutput,
  type AudioOutput,
  type BriefOutput,
  type PackageInput,
  type PackageOutput,
  type SceneTimelineEntry,
  type ScriptOutput
} from "@studio/shared";
import { geminiModels } from "@studio/providers";

export const packageAgent: Agent<PackageInput, PackageOutput> = {
  name: "package",
  inputSchema: PackageInputSchema,
  outputSchema: PackageOutputSchema,
  async run(ctx, input) {
    const brief = input.brief as BriefOutput;
    const script = input.script as ScriptOutput;
    const audio = input.audio as AudioOutput;
    const asset = input.asset as AssetOutput;

    await ctx.log.log("package_start", "Package Agent started", { sceneCount: script.scenes.length });

    const voiceBySceneId = new Map(audio.perScene.map((s) => [s.sceneId, s] as const));
    const assetBySceneId = new Map(asset.perScene.map((s) => [s.sceneId, s] as const));

    let cursor = 0;
    const timeline: SceneTimelineEntry[] = [];
    for (const scene of script.scenes) {
      const v = voiceBySceneId.get(scene.id);
      const a = assetBySceneId.get(scene.id);
      const voiceSigned = v?.voiceGcsPath ? await ctx.storage.signedUrl(v.voiceGcsPath) : null;
      const assetSigned = a?.gcsPath ? await ctx.storage.signedUrl(a.gcsPath) : null;
      const musicSigned = audio.music.gcsPath ? await ctx.storage.signedUrl(audio.music.gcsPath) : null;
      const start = cursor;
      const end = cursor + scene.durationSeconds;
      cursor = end;
      timeline.push({
        sceneId: scene.id,
        order: scene.order,
        startSecond: start,
        endSecond: end,
        durationSeconds: scene.durationSeconds,
        title: scene.title,
        narration: scene.narration,
        visualPrompt: scene.visualPrompt,
        veoPrompt: enrichVeoPrompt({
          veoPrompt: scene.veoPrompt,
          backgroundVisualPrompt: script.backgroundVisualPrompt,
          order: scene.order,
          total: script.scenes.length,
          referenceImagePrompt: scene.referenceImagePrompt ?? null,
          referenceFramePrompt: a?.referenceFrame?.prompt ?? null,
          textToVideoOnly: !a?.referenceFrame?.signedUrl && !a?.referenceFrame?.gcsPath
        }),
        referenceImagePrompt: scene.referenceImagePrompt ?? null,
        firstFramePrompt: scene.firstFramePrompt ?? null,
        lastFramePrompt: scene.lastFramePrompt ?? null,
        durationBucket: scene.durationBucket,
        audioPolicy: scene.audioPolicy,
        background: {
          artifactId: a?.artifactId ?? null,
          gcsPath: a?.gcsPath ?? null,
          signedUrl: assetSigned,
          kind: (a?.kind ?? null) as "video" | "image" | null
        },
        referenceFrame: {
          artifactId: a?.referenceFrame?.artifactId ?? null,
          gcsPath: a?.referenceFrame?.gcsPath ?? null,
          signedUrl: a?.referenceFrame?.signedUrl ?? null,
          prompt: a?.referenceFrame?.prompt ?? null,
          model: a?.referenceFrame?.model ?? null
        },
        firstFrame: {
          artifactId: a?.firstFrame?.artifactId ?? null,
          gcsPath: a?.firstFrame?.gcsPath ?? null,
          signedUrl: a?.firstFrame?.signedUrl ?? null,
          prompt: a?.firstFrame?.prompt ?? null,
          model: a?.firstFrame?.model ?? null
        },
        lastFrame: {
          artifactId: a?.lastFrame?.artifactId ?? null,
          gcsPath: a?.lastFrame?.gcsPath ?? null,
          signedUrl: a?.lastFrame?.signedUrl ?? null,
          prompt: a?.lastFrame?.prompt ?? null,
          model: a?.lastFrame?.model ?? null
        },
        voice: {
          artifactId: v?.voiceArtifactId ?? null,
          gcsPath: v?.voiceGcsPath ?? null,
          signedUrl: voiceSigned
        },
        music: {
          artifactId: audio.music.artifactId,
          gcsPath: audio.music.gcsPath,
          signedUrl: musicSigned
        }
      });
    }

    const manifest = {
      runId: ctx.runId,
      title: brief.title,
      aspectRatio: brief.aspectRatio,
      durationSeconds: script.totalDurationSeconds,
      language: brief.language,
      musicPrompt: audio.music.prompt,
      backgroundVisualPrompt: script.backgroundVisualPrompt,
      generatedAt: new Date().toISOString(),
      sceneCount: timeline.length
    };

    const geminiProvider = await ctx.providers.primary("GEMINI");
    const models = geminiModels(geminiProvider);
    const geminiRenderPlan = {
      runId: ctx.runId,
      generatedAt: new Date().toISOString(),
      models,
      renderPolicy: {
        provider: "gemini-veo",
        noPlaceholderFallback: true,
        audioPolicy: "Use Gemini TTS/Lyria artifacts and FFmpeg mix; do not rely on Veo native audio for exact narration."
      },
      scenes: timeline.map((scene) => ({
        sceneId: scene.sceneId,
        order: scene.order,
        veoPrompt: scene.veoPrompt,
        durationBucket: scene.durationBucket,
        aspectRatio: brief.aspectRatio,
        mode: scene.firstFrame?.signedUrl && scene.lastFrame?.signedUrl
          ? "first-last-frame"
          : scene.referenceFrame?.signedUrl
            ? "image-to-video"
            : "text-to-video",
        referenceImageUrl: scene.referenceFrame?.signedUrl ?? scene.background.signedUrl,
        firstFrameUrl: scene.firstFrame?.signedUrl ?? null,
        lastFrameUrl: scene.lastFrame?.signedUrl ?? null,
        voiceUrl: scene.voice.signedUrl,
        musicUrl: scene.music.signedUrl,
        audioPolicy: scene.audioPolicy
      }))
    };

    const instructions = renderInstructionsMarkdown(brief, script, timeline);

    const manifestArt = await ctx.artifacts.save({
      runId: ctx.runId,
      stage: "package",
      kind: "package_manifest",
      body: JSON.stringify(manifest, null, 2),
      mimeType: "application/json",
      filename: "manifest.json"
    });
    const instructionsArt = await ctx.artifacts.save({
      runId: ctx.runId,
      stage: "package",
      kind: "package_instructions",
      body: instructions,
      mimeType: "text/markdown",
      filename: "instructions.md"
    });
    const timelineArt = await ctx.artifacts.save({
      runId: ctx.runId,
      stage: "package",
      kind: "package_timeline",
      body: JSON.stringify(timeline, null, 2),
      mimeType: "application/json",
      filename: "timeline.json"
    });
    const geminiRenderPlanArt = await ctx.artifacts.save({
      runId: ctx.runId,
      stage: "package",
      kind: "package_gemini_render_plan",
      body: JSON.stringify(geminiRenderPlan, null, 2),
      mimeType: "application/json",
      filename: "gemini-render-plan.json"
    });

    const manifestSignedUrl = await ctx.storage.signedUrl(manifestArt.gcsPath);

    await ctx.log.log("package_done", "Package Agent finished", { scenes: timeline.length });
    return {
      manifestArtifactId: manifestArt.id,
      manifestGcsPath: manifestArt.gcsPath,
      manifestSignedUrl,
      instructionsArtifactId: instructionsArt.id,
      instructionsGcsPath: instructionsArt.gcsPath,
      timelineArtifactId: timelineArt.id,
      timelineGcsPath: timelineArt.gcsPath,
      geminiRenderPlanArtifactId: geminiRenderPlanArt.id,
      geminiRenderPlanGcsPath: geminiRenderPlanArt.gcsPath,
      timeline
    };
  }
};

function renderInstructionsMarkdown(brief: BriefOutput, script: ScriptOutput, timeline: SceneTimelineEntry[]): string {
  const lines: string[] = [];
  lines.push(`# Render package — ${brief.title}`);
  lines.push("");
  lines.push(`- Duration: ${script.totalDurationSeconds}s`);
  lines.push(`- Aspect ratio: ${brief.aspectRatio}`);
  lines.push(`- Language: ${brief.language}`);
  lines.push(`- Audience: ${brief.targetAudience}`);
  lines.push(`- Style: ${brief.style}`);
  lines.push("");
  lines.push("## Scenes");
  for (const scene of timeline) {
    lines.push(`### Scene ${scene.order + 1}: ${scene.title}`);
    lines.push(`- Time: ${scene.startSecond}s → ${scene.endSecond}s (${scene.durationSeconds}s)`);
    lines.push(`- Narration: ${scene.narration}`);
    lines.push(`- Visual: ${scene.visualPrompt}`);
    lines.push(`- Veo prompt: ${scene.veoPrompt}`);
    lines.push(`- Duration bucket: ${scene.durationBucket}s`);
    lines.push(`- Audio policy: ${scene.audioPolicy}`);
    lines.push(`- Reference frame: ${scene.referenceFrame?.gcsPath ?? "(none)"}`);
    lines.push(`- First frame: ${scene.firstFrame?.gcsPath ?? "(none)"}`);
    lines.push(`- Last frame: ${scene.lastFrame?.gcsPath ?? "(none)"}`);
    lines.push(`- Background: ${scene.background.gcsPath ?? "(none)"}`);
    lines.push(`- Voice: ${scene.voice.gcsPath ?? "(none)"}`);
    lines.push(`- Music: ${scene.music.gcsPath ?? "(none)"}`);
    lines.push("");
  }
  return lines.join("\n");
}

function enrichVeoPrompt(input: {
  veoPrompt: string;
  backgroundVisualPrompt: string;
  order: number;
  total: number;
  referenceImagePrompt: string | null;
  referenceFramePrompt: string | null;
  textToVideoOnly: boolean;
}): string {
  const bible = input.backgroundVisualPrompt.trim();
  const continuity = `Same location, characters, lighting and wardrobe throughout. Scene ${input.order + 1} of ${input.total}.`;
  const prefix = bible ? `${continuity} Visual bible: ${bible}. ` : `${continuity} `;
  const refPrompt = (input.referenceFramePrompt ?? input.referenceImagePrompt ?? "").trim();
  const refSuffix =
    input.textToVideoOnly && refPrompt
      ? ` Match this reference look (text-only, no image upload): ${refPrompt}.`
      : "";
  return `${prefix}${input.veoPrompt}${refSuffix}`;
}
