import {
  getVideoBeatGenerator,
  stablePromptHash,
  type VideoBeatGenerator,
  type VideoBeatHooks,
  type VideoBeatResult
} from "@studio/providers";
import {
  NoProviderConfiguredError,
  RenderInputSchema,
  RenderOutputSchema,
  getRenderProfile,
  type Agent,
  type AgentContext,
  type GcsClient,
  type ProviderCredentialView,
  type RenderInput,
  type RenderOutput,
  type RenderProfile,
  type RenderSceneResult,
  type SceneTimelineEntry
} from "@studio/shared";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import ffmpegStatic from "ffmpeg-static";

export const renderAgent: Agent<RenderInput, RenderOutput> = {
  name: "render",
  inputSchema: RenderInputSchema,
  outputSchema: RenderOutputSchema,
  async run(ctx, input) {
    const renderProfile = getRenderProfile(input.renderProfile);
    await ctx.log.log("render_start", "Render Agent started", {
      sceneCount: input.timeline.length,
      renderProfile: renderProfile.id
    });

    const credentialType = renderProfile.provider === "kling" ? "VIDEO" : "GEMINI";
    const provider = await ctx.providers.primary(credentialType);
    if (!provider) {
      throw new NoProviderConfiguredError(credentialType);
    }
    const beatGenerator = getVideoBeatGenerator(renderProfile, provider);
    await ctx.log.log("render_provider_selected", "Video provider selected", {
      provider: provider.provider,
      priority: provider.priority,
      renderProfile: renderProfile.id,
      videoProvider: renderProfile.provider,
      strategy: renderProfile.strategy
    });

    const dir = path.join(tmpdir(), `studio-agents-${ctx.runId}-${nanoid(6)}`);
    await mkdir(dir, { recursive: true });

    const perScene: RenderSceneResult[] = [];
    const clipFiles: string[] = [];
    const geminiOperations: RenderOutput["geminiOperations"] = [];

    try {
      if (renderProfile.strategy === "extend") {
        return await renderExtendChain(ctx, input, beatGenerator, provider, dir, renderProfile);
      }

      for (const scene of input.timeline) {
        const promptHash = stablePromptHash(scene.veoPrompt);
        await ctx.log.log("render_scene_start", "Rendering scene", {
          sceneId: scene.sceneId,
          order: scene.order,
          renderProfile: renderProfile.id
        });
        const referenceSource =
          scene.referenceFrame?.gcsPath || scene.referenceFrame?.signedUrl ? scene.referenceFrame : scene.background;
        const [referenceImage, firstFrame, lastFrame] = await Promise.all([
          loadMediaBytes(ctx.storage, referenceSource),
          loadMediaBytes(ctx.storage, scene.firstFrame),
          loadMediaBytes(ctx.storage, scene.lastFrame)
        ]);
        const result = await beatGenerator.generateBeat(
          {
            sceneId: scene.sceneId,
            prompt: scene.veoPrompt,
            aspectRatio: input.aspectRatio === "16:9" ? "16:9" : "9:16",
            durationBucket: scene.durationBucket,
            durationSeconds: scene.durationSeconds,
            referenceImage,
            firstFrame,
            lastFrame,
            generateAudio: scene.audioPolicy === "veo_native_audio"
          },
          buildBeatHooks(ctx, scene)
        );
        if (!result.videoBytes) {
          throw new Error(`Video generation completed without bytes for scene ${scene.sceneId}`);
        }
        geminiOperations.push({
          sceneId: scene.sceneId,
          operationName: result.operationName,
          status: result.status === "completed" ? "completed" : "failed",
          model: result.model,
          error: result.error ?? null
        });
        await saveBeatOperationArtifact(ctx, scene, promptHash, result, renderProfile, { extendsPrevious: false });

        const rawPath = path.join(dir, `scene-${scene.order}-raw.mp4`);
        await writeFile(rawPath, result.videoBytes);
        const mixedPath = await mixSceneAudio(rawPath, scene, dir, ctx.storage);
        const finalized = await finalizeSceneClip(mixedPath, dir, scene.sceneId);
        const scenePath = finalized.path;
        clipFiles.push(scenePath);

        const clipArtifact = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "render",
          kind: "scene_rendered_clip",
          body: await readFile(scenePath),
          mimeType: result.mimeType ?? "video/mp4",
          filename: `scene-${scene.order}.mp4`,
          metadata: {
            sceneId: scene.sceneId,
            provider: result.provider,
            model: result.model,
            order: scene.order,
            geminiOperationName: result.operationName,
            promptHash,
            renderProfileId: renderProfile.id
          }
        });

        perScene.push({
          sceneId: scene.sceneId,
          artifactId: clipArtifact.id,
          gcsPath: clipArtifact.gcsPath,
          durationSeconds: finalized.durationSeconds,
          provider: result.provider,
          model: result.model,
          geminiOperationName: result.operationName,
          promptHash
        });
      }

      const concatPath = path.join(dir, `concat-${nanoid(8)}.mp4`);
      await concatClips(
        clipFiles,
        concatPath,
        dir,
        perScene.map((s) => s.durationSeconds)
      );

      const musicScene = input.timeline.find((s) => s.music.gcsPath || s.music.signedUrl);
      const musicGcsPath = musicScene ? resolveGcsPath(ctx.storage, musicScene.music) : null;
      const totalDurationSeconds = perScene.reduce((sum, s) => sum + s.durationSeconds, 0);
      let finalPath = concatPath;
      if (musicGcsPath) {
        const musicLocal = path.join(dir, `music-${nanoid(4)}${musicExtension(musicGcsPath)}`);
        await downloadMediaToFile(ctx.storage, musicGcsPath, musicLocal);
        finalPath = await muxMusicTrack(concatPath, musicLocal, dir);
      }

      const outputScale = Number(process.env.RENDER_OUTPUT_SCALE ?? 0);
      if (outputScale > 0) {
        finalPath = await downscaleVideo(finalPath, outputScale, dir);
      }

      const finalArtifact = await ctx.artifacts.save({
        runId: ctx.runId,
        stage: "render",
        kind: "final_video",
        body: await readFile(finalPath),
        mimeType: "video/mp4",
        filename: `final-${ctx.runId}.mp4`,
        metadata: {
          renderProfileId: renderProfile.id,
          provider: renderProfile.provider,
          strategy: renderProfile.strategy
        }
      });
      const finalSignedUrl = await ctx.storage.signedUrl(finalArtifact.gcsPath);

      await ctx.log.log("render_done", "Render Agent finished", {
        scenes: perScene.length,
        totalDurationSeconds,
        renderProfile: renderProfile.id
      });
      return {
        provider: provider.provider,
        perScene,
        finalArtifactId: finalArtifact.id,
        finalGcsPath: finalArtifact.gcsPath,
        finalSignedUrl,
        totalDurationSeconds,
        geminiOperations
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
};

async function renderExtendChain(
  ctx: AgentContext,
  input: RenderInput,
  beatGenerator: VideoBeatGenerator,
  provider: ProviderCredentialView,
  dir: string,
  renderProfile: RenderProfile
): Promise<RenderOutput> {
  const sortedTimeline = [...input.timeline].sort((a, b) => a.order - b.order);
  if (sortedTimeline.length === 0) {
    throw new Error("Cannot render extend chain: timeline is empty");
  }

  await ctx.log.log("render_extend_start", "Video extend chain started", {
    beatCount: sortedTimeline.length,
    renderProfile: renderProfile.id
  });

  const perScene: RenderSceneResult[] = [];
  const geminiOperations: RenderOutput["geminiOperations"] = [];
  let extendHandle: string | null = null;
  let lastResult: VideoBeatResult | null = null;
  let lastModel = "";

  for (let index = 0; index < sortedTimeline.length; index++) {
    const scene = sortedTimeline[index]!;
    const isFirst = index === 0;
    const promptHash = stablePromptHash(scene.veoPrompt);
    await ctx.log.log("render_extend_step", "Extend chain step", {
      sceneId: scene.sceneId,
      order: scene.order,
      step: index + 1,
      totalSteps: sortedTimeline.length,
      extendsPrevious: !isFirst,
      renderProfile: renderProfile.id
    });

    const referenceSource =
      isFirst && (scene.referenceFrame?.gcsPath || scene.referenceFrame?.signedUrl)
        ? scene.referenceFrame
        : isFirst
          ? scene.background
          : null;
    const [referenceImage, firstFrame, lastFrame] = await Promise.all([
      isFirst ? loadMediaBytes(ctx.storage, referenceSource) : Promise.resolve(null),
      isFirst ? loadMediaBytes(ctx.storage, scene.firstFrame) : Promise.resolve(null),
      isFirst ? loadMediaBytes(ctx.storage, scene.lastFrame) : Promise.resolve(null)
    ]);

    const result = await beatGenerator.generateBeat(
      {
        sceneId: scene.sceneId,
        prompt: scene.veoPrompt,
        aspectRatio: input.aspectRatio === "16:9" ? "16:9" : "9:16",
        durationBucket: scene.durationBucket,
        durationSeconds: scene.durationSeconds,
        referenceImage,
        firstFrame,
        lastFrame,
        extendVideoHandle: extendHandle,
        generateAudio: scene.audioPolicy === "veo_native_audio"
      },
      buildBeatHooks(ctx, scene, renderProfile.id)
    );

    if (!result.videoBytes) {
      throw new Error(`Video extend completed without bytes for scene ${scene.sceneId}`);
    }

    geminiOperations.push({
      sceneId: scene.sceneId,
      operationName: result.operationName,
      status: result.status === "completed" ? "completed" : "failed",
      model: result.model,
      error: result.error ?? null
    });

    await saveBeatOperationArtifact(ctx, scene, promptHash, result, renderProfile, { extendsPrevious: !isFirst });

    extendHandle = result.extendHandle ?? result.operationName;
    lastResult = result;
    lastModel = result.model;

    perScene.push({
      sceneId: scene.sceneId,
      artifactId: "pending",
      gcsPath: "pending",
      durationSeconds: scene.durationSeconds,
      provider: result.provider,
      model: result.model,
      geminiOperationName: result.operationName,
      promptHash
    });
  }

  if (!lastResult?.videoBytes) {
    throw new Error("Extend chain produced no final video bytes");
  }

  const rawPath = path.join(dir, `extend-chain-${nanoid(6)}-raw.mp4`);
  await writeFile(rawPath, lastResult.videoBytes);
  const mixedPath = await mixExtendTimelineAudio(rawPath, sortedTimeline, dir, ctx.storage);
  const finalized = await finalizeSceneClip(mixedPath, dir, "extend-chain");
  const totalDurationSeconds = finalized.durationSeconds;

  const clipArtifact = await ctx.artifacts.save({
    runId: ctx.runId,
    stage: "render",
    kind: "scene_rendered_clip",
    body: await readFile(finalized.path),
    mimeType: lastResult.mimeType ?? "video/mp4",
    filename: "extend-chain.mp4",
    metadata: {
      sceneId: sortedTimeline.map((s) => s.sceneId).join(","),
      provider: lastResult.provider,
      model: lastModel,
      renderProfileId: renderProfile.id,
      strategy: renderProfile.strategy,
      beatCount: sortedTimeline.length
    }
  });

  for (const row of perScene) {
    row.artifactId = clipArtifact.id;
    row.gcsPath = clipArtifact.gcsPath;
  }

  let finalPath = finalized.path;
  const musicScene = input.timeline.find((s) => s.music.gcsPath || s.music.signedUrl);
  const musicGcsPath = musicScene ? resolveGcsPath(ctx.storage, musicScene.music) : null;
  if (musicGcsPath) {
    const musicLocal = path.join(dir, `music-${nanoid(4)}${musicExtension(musicGcsPath)}`);
    await downloadMediaToFile(ctx.storage, musicGcsPath, musicLocal);
    finalPath = await muxMusicTrack(finalPath, musicLocal, dir);
  }

  const outputScale = Number(process.env.RENDER_OUTPUT_SCALE ?? 0);
  if (outputScale > 0) {
    finalPath = await downscaleVideo(finalPath, outputScale, dir);
  }

  const finalArtifact = await ctx.artifacts.save({
    runId: ctx.runId,
    stage: "render",
    kind: "final_video",
    body: await readFile(finalPath),
    mimeType: "video/mp4",
    filename: `final-${ctx.runId}.mp4`,
    metadata: {
      renderProfileId: renderProfile.id,
      provider: renderProfile.provider,
      strategy: renderProfile.strategy
    }
  });
  const finalSignedUrl = await ctx.storage.signedUrl(finalArtifact.gcsPath);

  await ctx.log.log("render_done", "Render Agent finished (extend chain)", {
    scenes: perScene.length,
    totalDurationSeconds,
    renderProfile: renderProfile.id
  });

  return {
    provider: provider.provider,
    perScene,
    finalArtifactId: finalArtifact.id,
    finalGcsPath: finalArtifact.gcsPath,
    finalSignedUrl,
    totalDurationSeconds,
    geminiOperations
  };
}

function buildBeatHooks(ctx: AgentContext, scene: SceneTimelineEntry, renderProfileId?: string): VideoBeatHooks {
  return {
    onPoll: async (operation) => {
      await ctx.log.log("video_operation_status", "Video operation status", {
        sceneId: scene.sceneId,
        operationName: operation.operationName,
        status: operation.status,
        model: operation.model,
        error: operation.error ?? null,
        renderProfile: renderProfileId ?? null
      });
    },
    onUsage: async (event) => {
      await ctx.cost.record({
        activityType: event.activityType as "veo_video",
        sceneId: event.sceneId ?? scene.sceneId,
        model: event.model,
        durationMs: event.durationMs,
        billedUnits: event.billedUnits,
        unit: event.unit as "veo_seconds",
        charged: event.charged,
        metadata: event.metadata
      });
    }
  };
}

async function saveBeatOperationArtifact(
  ctx: AgentContext,
  scene: SceneTimelineEntry,
  promptHash: string,
  result: VideoBeatResult,
  renderProfile: RenderProfile,
  extra: { extendsPrevious: boolean }
): Promise<void> {
  const videoBytesLength = result.videoBytes?.length ?? 0;
  await ctx.artifacts.save({
    runId: ctx.runId,
    stage: "render",
    kind: "gemini_operation",
    body: JSON.stringify(
      {
        sceneId: scene.sceneId,
        promptHash,
        renderProfile: renderProfile.id,
        extendsPrevious: extra.extendsPrevious,
        operation: {
          provider: result.provider,
          operationName: result.operationName,
          model: result.model,
          status: result.status,
          error: result.error ?? null,
          videoBytesLength
        }
      },
      null,
      2
    ),
    mimeType: "application/json",
    filename: `scene-${scene.order}-veo-operation.json`,
    metadata: {
      sceneId: scene.sceneId,
      operationName: result.operationName,
      model: result.model,
      promptHash,
      sourceStage: "render",
      renderProfileId: renderProfile.id
    }
  });
}

async function mixExtendTimelineAudio(
  videoPath: string,
  timeline: SceneTimelineEntry[],
  dir: string,
  storage: GcsClient
): Promise<string> {
  if (timeline.every((scene) => scene.audioPolicy === "veo_native_audio")) {
    return videoPath;
  }

  const voiceTracks: Array<{ path: string; delayMs: number }> = [];
  for (const scene of timeline) {
    if (!shouldUseVoice(scene)) continue;
    const voiceGcsPath = resolveGcsPath(storage, scene.voice);
    if (!voiceGcsPath) continue;
    const voiceLocal = path.join(dir, `voice-${scene.sceneId}-${nanoid(4)}.audio`);
    await downloadMediaToFile(storage, voiceGcsPath, voiceLocal);
    voiceTracks.push({ path: voiceLocal, delayMs: Math.round(scene.startSecond * 1000) });
  }

  if (voiceTracks.length === 0) {
    return stripAudio(videoPath, dir);
  }

  const videoDur = await probeDuration(videoPath);
  const out = path.join(dir, `extend-voice-${nanoid(4)}.mp4`);
  const inputs: string[] = ["-i", videoPath];
  const filterParts: string[] = [];

  for (let i = 0; i < voiceTracks.length; i++) {
    const track = voiceTracks[i]!;
    inputs.push("-i", track.path);
    const delay = track.delayMs;
    filterParts.push(`[${i + 1}:a]adelay=${delay}|${delay},apad=whole_dur=${videoDur}[v${i}]`);
  }

  const mixInputs = voiceTracks.map((_, i) => `[v${i}]`).join("");
  filterParts.push(`${mixInputs}amix=inputs=${voiceTracks.length}:duration=longest:dropout_transition=0[aout]`);

  await runFfmpeg([
    ...inputs,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-t",
    String(videoDur),
    "-movflags",
    "+faststart",
    "-y",
    out
  ]);
  return out;
}

function shouldUseVoice(scene: SceneTimelineEntry): boolean {
  const policy = scene.audioPolicy ?? "gemini_tts_plus_music";
  return policy !== "muted" && policy !== "veo_native_audio" && Boolean(scene.voice.gcsPath || scene.voice.signedUrl);
}

type MediaRef = { gcsPath?: string | null; signedUrl?: string | null };

function gcsPathFromSignedUrl(url: string, bucket: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "storage.googleapis.com") return null;
    const parts = parsed.pathname.replace(/^\/+/, "").split("/");
    if (parts[0] !== bucket || parts.length < 2) return null;
    return parts.slice(1).join("/");
  } catch {
    return null;
  }
}

function resolveGcsPath(storage: GcsClient, ref: MediaRef | null | undefined): string | null {
  if (!ref) return null;
  if (ref.gcsPath) return ref.gcsPath;
  if (ref.signedUrl) return gcsPathFromSignedUrl(ref.signedUrl, storage.bucket());
  return null;
}

async function loadMediaBytes(
  storage: GcsClient,
  ref: MediaRef | null | undefined
): Promise<{ body: Buffer; mimeType: string } | null> {
  const gcsPath = resolveGcsPath(storage, ref);
  if (!gcsPath) return null;
  return storage.download(gcsPath);
}

async function downloadMediaToFile(storage: GcsClient, gcsPath: string, dest: string): Promise<void> {
  let fetchError: string | null = null;
  try {
    const { body } = await storage.download(gcsPath);
    await writeFile(dest, body);
    return;
  } catch (sdkError) {
    const sdkMessage = sdkError instanceof Error ? sdkError.message : String(sdkError);
    try {
      const url = await storage.signedUrl(gcsPath);
      await fetchToFile(url, dest, gcsPath);
      return;
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to download ${gcsPath}: ${sdkMessage}${fetchError ? `; ${fetchError}` : ""}`);
    }
  }
}

async function mixSceneAudio(
  videoPath: string,
  scene: SceneTimelineEntry,
  dir: string,
  storage: GcsClient
): Promise<string> {
  if (scene.audioPolicy === "veo_native_audio") {
    return videoPath;
  }
  if (!shouldUseVoice(scene)) {
    return stripAudio(videoPath, dir);
  }
  const voiceGcsPath = resolveGcsPath(storage, scene.voice);
  if (!voiceGcsPath) {
    return stripAudio(videoPath, dir);
  }
  const videoDur = await probeDuration(videoPath);
  const voiceLocal = path.join(dir, `voice-${scene.sceneId}-${nanoid(4)}.audio`);
  await downloadMediaToFile(storage, voiceGcsPath, voiceLocal);
  const out = path.join(dir, `${path.basename(videoPath, ".mp4")}-voice.mp4`);
  // Keep full Veo clip; trim or pad narration to match video length (never shorten video with -shortest).
  await runFfmpeg([
    "-i",
    videoPath,
    "-i",
    voiceLocal,
    "-filter_complex",
    `[1:a]atrim=0:${videoDur},asetpts=PTS-STARTPTS,apad=whole_dur=${videoDur}[aout]`,
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-t",
    String(videoDur),
    "-movflags",
    "+faststart",
    "-y",
    out
  ]);
  return out;
}

async function stripAudio(videoPath: string, dir: string): Promise<string> {
  const out = path.join(dir, `${path.basename(videoPath, ".mp4")}-silent.mp4`);
  await runFfmpeg(["-i", videoPath, "-map", "0:v:0", "-c:v", "copy", "-an", "-movflags", "+faststart", "-y", out]);
  return out;
}

async function muxMusicTrack(videoPath: string, musicPath: string, dir: string): Promise<string> {
  const out = path.join(dir, `final-with-music-${nanoid(4)}.mp4`);
  const videoDur = await probeDuration(videoPath);
  const hasAudio = await probeHasAudio(videoPath);
  if (hasAudio) {
    await runFfmpeg([
      "-i",
      videoPath,
      "-stream_loop",
      "-1",
      "-i",
      musicPath,
      "-filter_complex",
      `[0:a]volume=1.0[voice];[1:a]volume=0.28[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-t",
      String(videoDur),
      "-movflags",
      "+faststart",
      "-y",
      out
    ]);
  } else {
    await runFfmpeg([
      "-i",
      videoPath,
      "-stream_loop",
      "-1",
      "-i",
      musicPath,
      "-filter_complex",
      `[1:a]volume=0.35,apad=whole_dur=${videoDur}[aout]`,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-t",
      String(videoDur),
      "-movflags",
      "+faststart",
      "-y",
      out
    ]);
  }
  return out;
}

function musicExtension(pathOrUrl: string): string {
  if (pathOrUrl.includes(".wav")) return ".wav";
  if (pathOrUrl.includes(".mp3") || pathOrUrl.includes("mpeg")) return ".mp3";
  return ".audio";
}

async function fetchToFile(url: string, dest: string, label?: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    const name = label ?? url.split("?")[0]?.split("/").slice(-1)[0] ?? "media";
    const expiredHint = res.status === 403 ? " (ייתכן שפג תוקף הקישור)" : "";
    throw new Error(`Failed to download ${name}: HTTP ${res.status}${expiredHint}`);
  }
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function downscaleVideo(videoPath: string, width: number, dir: string): Promise<string> {
  const out = path.join(dir, `scaled-${width}-${nanoid(4)}.mp4`);
  await runFfmpeg([
    "-i",
    videoPath,
    "-vf",
    `scale=${width}:-2`,
    "-c:v",
    "libx264",
    "-crf",
    "28",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    "-y",
    out
  ]);
  return out;
}

async function concatClips(
  clipPaths: string[],
  outputPath: string,
  dir: string,
  clipDurations?: number[]
): Promise<void> {
  if (clipPaths.length === 0) {
    throw new Error("Cannot concat: no clips rendered");
  }
  if (clipPaths.length === 1) {
    await runFfmpeg(["-i", clipPaths[0]!, "-c", "copy", "-movflags", "+faststart", "-y", outputPath]);
    return;
  }

  const xfadeSeconds = sceneXfadeSeconds();
  if (xfadeSeconds > 0) {
    const durations =
      clipDurations?.length === clipPaths.length
        ? clipDurations
        : await Promise.all(clipPaths.map((p) => probeDuration(p)));
    await concatClipsWithXfade(clipPaths, outputPath, durations, xfadeSeconds);
    return;
  }

  const listPath = path.join(dir, `concat-${nanoid(6)}.txt`);
  await writeFile(
    listPath,
    clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
    "utf8"
  );
  // Re-encode for seamless joins (copy concat glitches when clip codecs differ).
  await runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-y",
    outputPath
  ]);
}

function sceneXfadeSeconds(): number {
  const value = Number(process.env.RENDER_SCENE_XFADE_SECONDS ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1.5);
}

async function concatClipsWithXfade(
  clipPaths: string[],
  outputPath: string,
  durations: number[],
  xfadeSeconds: number
): Promise<void> {
  const inputs: string[] = [];
  for (const clip of clipPaths) {
    inputs.push("-i", clip);
  }

  const minDur = Math.min(...durations);
  const fade = Math.min(xfadeSeconds, Math.max(0.1, minDur * 0.25));

  const videoParts: string[] = [];
  const audioParts: string[] = [];
  let vIn = "0:v";
  let aIn = "0:a";
  let offset = durations[0]! - fade;

  for (let i = 1; i < clipPaths.length; i++) {
    const vOut = i === clipPaths.length - 1 ? "vout" : `v${i}`;
    const aOut = i === clipPaths.length - 1 ? "aout" : `a${i}`;
    videoParts.push(
      `[${vIn}][${i}:v]xfade=transition=fade:duration=${fade}:offset=${Math.max(0, offset).toFixed(3)}[${vOut}]`
    );
    audioParts.push(`[${aIn}][${i}:a]acrossfade=d=${fade}:c1=tri:c2=tri[${aOut}]`);
    vIn = vOut;
    aIn = aOut;
    if (i < clipPaths.length - 1) {
      offset += durations[i]! - fade;
    }
  }

  const filter = [...videoParts, ...audioParts].join(";");
  await runFfmpeg([
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-y",
    outputPath
  ]);
}

/** Normalize each scene clip to the same codec and ensure an audio track exists. */
async function finalizeSceneClip(
  inputPath: string,
  dir: string,
  sceneId: string
): Promise<{ path: string; durationSeconds: number }> {
  const dur = await probeDuration(inputPath);
  const hasAudio = await probeHasAudio(inputPath);
  const out = path.join(dir, `scene-final-${sceneId}-${nanoid(4)}.mp4`);
  if (hasAudio) {
    await runFfmpeg([
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-t",
      String(dur),
      "-movflags",
      "+faststart",
      "-y",
      out
    ]);
  } else {
    await runFfmpeg([
      "-i",
      inputPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      String(dur),
      "-shortest",
      "-movflags",
      "+faststart",
      "-y",
      out
    ]);
  }
  return { path: out, durationSeconds: dur };
}

async function probeDuration(filePath: string): Promise<number> {
  const stderr = await ffmpegStderr(["-i", filePath, "-f", "null", "-"]);
  const match = stderr.match(/Duration:\s(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) {
    throw new Error(`Could not probe duration for ${filePath}`);
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function probeHasAudio(filePath: string): Promise<boolean> {
  const stderr = await ffmpegStderr(["-i", filePath, "-f", "null", "-"]);
  return /Stream #\d+:\d+.*Audio:/i.test(stderr);
}

async function ffmpegStderr(args: string[]): Promise<string> {
  const bin = (ffmpegStatic as unknown as string) ?? "ffmpeg";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0 || stderr.includes("Duration:")) {
        resolve(stderr);
        return;
      }
      reject(new Error(`ffmpeg probe exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function runFfmpeg(args: string[]): Promise<void> {
  const bin = (ffmpegStatic as unknown as string) ?? "ffmpeg";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}
