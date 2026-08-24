import {
  getVideoBeatGenerator,
  stablePromptHash,
  type VideoBeatGenerator,
  type VideoBeatHooks,
  type VideoBeatRequest,
  type VideoBeatResult
} from "@studio/providers";
import {
  NoProviderConfiguredError,
  RenderInputSchema,
  RenderOutputSchema,
  buildKaraokeAss,
  buildTitleCardAss,
  getRenderProfile,
  sanitizeVeoPromptForExternalAudio,
  usesFalVideoProvider,
  usesHeygenVideoProvider,
  type Agent,
  type AgentContext,
  type ArtifactRecord,
  type BriefBrandingOutput,
  type GcsClient,
  type KaraokeLineCue,
  type ProviderCredentialView,
  type RenderInput,
  type RenderOutput,
  type RenderProfile,
  type RenderSceneResult,
  type SceneTimelineEntry
} from "@studio/shared";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import ffmpegStatic from "ffmpeg-static";
import { withVeoInflightGate } from "./veoInflight.js";

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

    const provider = usesHeygenVideoProvider(renderProfile)
      ? resolveHeygenCredential()
      : await ctx.providers.primary(usesFalVideoProvider(renderProfile) ? "VIDEO" : "GEMINI");
    if (!provider) {
      throw new NoProviderConfiguredError(
        usesHeygenVideoProvider(renderProfile)
          ? "HEYGEN"
          : usesFalVideoProvider(renderProfile)
            ? "VIDEO"
            : "GEMINI"
      );
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
    const dimensions = targetVideoDimensions(input.aspectRatio);

    const perScene: RenderSceneResult[] = [];
    const clipFiles: string[] = [];
    const geminiOperations: RenderOutput["geminiOperations"] = [];
    const existingClips = await loadExistingSceneClips(ctx);
    let veoPaidCalls = 0;
    await ctx.log.log("render_clip_cache", "Existing rendered clips for reuse", {
      cachedScenes: existingClips.size,
      timelineScenes: input.timeline.length
    });

    try {
      if (renderProfile.strategy === "extend") {
        return await renderExtendChain(ctx, input, beatGenerator, provider, dir, renderProfile, dimensions);
      }

      for (const scene of input.timeline) {
        const isTitleCard = scene.sceneKind === "title_card";
        const promptHash = stablePromptHash(
          isTitleCard ? `title_card:${scene.title}:${scene.visualPrompt}` : scene.veoPrompt
        );
        await ctx.log.log("render_scene_start", "Rendering scene", {
          sceneId: scene.sceneId,
          order: scene.order,
          renderProfile: renderProfile.id,
          sceneKind: isTitleCard ? "title_card" : "beat"
        });

        const cached = existingClips.get(scene.sceneId);
        const cachedHash = cached?.promptHash ?? "";
        if (cached && (!cachedHash || cachedHash === promptHash)) {
          await ctx.log.log("render_reuse_clip", "Reusing existing rendered clip (no re-bill)", {
            sceneId: scene.sceneId,
            artifactId: cached.artifact.id,
            promptHash
          });
          const downloaded = await ctx.storage.download(cached.artifact.gcsPath);
          const rawReuse = path.join(dir, `scene-${scene.order}-reused-raw.mp4`);
          await writeFile(rawReuse, downloaded.body);
          const finalizedReuse = await finalizeSceneClip(rawReuse, dir, scene.sceneId, dimensions);
          clipFiles.push(finalizedReuse.path);
          perScene.push({
            sceneId: scene.sceneId,
            artifactId: cached.artifact.id,
            gcsPath: cached.artifact.gcsPath,
            durationSeconds: finalizedReuse.durationSeconds,
            provider: String(cached.artifact.metadata.provider ?? "cached"),
            model: String(cached.artifact.metadata.model ?? ""),
            geminiOperationName: String(cached.artifact.metadata.geminiOperationName ?? ""),
            promptHash
          });
          continue;
        }

        if (isTitleCard) {
          const titlePath = await createTitleCardClip(dir, dimensions, scene);
          const finalizedTitle = await finalizeSceneClip(titlePath, dir, scene.sceneId, dimensions);
          const scenePath = finalizedTitle.path;
          clipFiles.push(scenePath);
          const clipArtifact = await ctx.artifacts.save({
            runId: ctx.runId,
            stage: "render",
            kind: "scene_rendered_clip",
            body: await readFile(scenePath),
            mimeType: "video/mp4",
            filename: `scene-${scene.order}-title.mp4`,
            metadata: {
              sceneId: scene.sceneId,
              provider: "ffmpeg",
              model: "title_card",
              order: scene.order,
              promptHash,
              renderProfileId: renderProfile.id,
              sceneKind: "title_card"
            }
          });
          perScene.push({
            sceneId: scene.sceneId,
            artifactId: clipArtifact.id,
            gcsPath: clipArtifact.gcsPath,
            durationSeconds: finalizedTitle.durationSeconds,
            provider: "ffmpeg",
            model: "title_card",
            geminiOperationName: null,
            promptHash
          });
          continue;
        }

        const referenceSource =
          scene.referenceFrame?.gcsPath || scene.referenceFrame?.signedUrl ? scene.referenceFrame : scene.background;
        const [referenceImage, firstFrame, lastFrame, voiceAudio] = await Promise.all([
          loadMediaBytes(ctx.storage, referenceSource),
          loadMediaBytes(ctx.storage, scene.firstFrame),
          loadMediaBytes(ctx.storage, scene.lastFrame),
          usesHeygenVideoProvider(renderProfile) ? loadMediaBytes(ctx.storage, scene.voice) : Promise.resolve(null)
        ]);
        const wantNativeAudio =
          scene.audioPolicy === "veo_native_audio" && process.env.GEMINI_VEO_AUDIO === "1";
        const beatReq: VideoBeatRequest = {
          sceneId: scene.sceneId,
          prompt: wantNativeAudio
            ? scene.veoPrompt
            : sanitizeVeoPromptForExternalAudio(scene.veoPrompt, {
                speakerName: scene.speakerName,
                multiCast: Boolean(scene.speakerName)
              }),
          aspectRatio: input.aspectRatio === "16:9" ? "16:9" : "9:16",
          durationBucket: scene.durationBucket,
          durationSeconds: scene.durationSeconds,
          referenceImage,
          firstFrame,
          lastFrame,
          generateAudio: wantNativeAudio,
          narrationText: scene.narration,
          voiceAudio
        };
        let result: VideoBeatResult;
        if (renderProfile.provider === "veo") {
          result = await withVeoInflightGate(
            {
              applySceneGap: veoPaidCalls > 0,
              log: async (event, message, meta) => {
                await ctx.log.log(event, message, meta);
              }
            },
            () => beatGenerator.generateBeat(beatReq, buildBeatHooks(ctx, scene))
          );
          veoPaidCalls += 1;
        } else {
          result = await beatGenerator.generateBeat(beatReq, buildBeatHooks(ctx, scene));
        }
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
        const mixedPath = await mixSceneAudio(rawPath, scene, dir, ctx.storage, {
          keepProviderAudio: renderProfile.capabilities.nativeAudio
        });
        const finalized = await finalizeSceneClip(mixedPath, dir, scene.sceneId, dimensions);
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
        perScene.map((s) => s.durationSeconds),
        dimensions
      );

      let assembledPath = concatPath;
      let totalDurationSeconds = perScene.reduce((sum, s) => sum + s.durationSeconds, 0);
      if (input.videoInsert?.gcsPath) {
        const spliced = await spliceExternalInsert(assembledPath, input.videoInsert, dir, dimensions, ctx.storage);
        assembledPath = spliced.path;
        totalDurationSeconds = spliced.durationSeconds;
        await ctx.log.log("render_video_insert", "External clip spliced into film", {
          insertAtSeconds: input.videoInsert.insertAtSeconds,
          audioSource: input.videoInsert.audioSource,
          totalDurationSeconds
        });
      }

      const musicScene = input.timeline.find((s) => s.music.gcsPath || s.music.signedUrl);
      const musicGcsPath = musicScene ? resolveGcsPath(ctx.storage, musicScene.music) : null;
      let finalPath = assembledPath;
      if (musicGcsPath) {
        const musicLocal = path.join(dir, `music-${nanoid(4)}${musicExtension(musicGcsPath)}`);
        await downloadMediaToFile(ctx.storage, musicGcsPath, musicLocal);
        finalPath = await muxMusicTrack(assembledPath, musicLocal, dir);
      }

      finalPath = await burnKaraokeAndWatermark(finalPath, dir, dimensions, input, ctx.log);

      finalPath = await appendBrandingEndCard(
        finalPath,
        dir,
        dimensions,
        input.branding ?? null,
        ctx.storage,
        input.brandEndVoice ?? null
      );

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
          strategy: renderProfile.strategy,
          endCard: input.branding && shouldUseBusinessEndCard(input.branding) ? "business" : "Prompt2Spot",
          branding: input.branding ?? null,
          videoInsert: input.videoInsert
            ? {
                insertAtSeconds: input.videoInsert.insertAtSeconds,
                audioSource: input.videoInsert.audioSource,
                name: input.videoInsert.name
              }
            : null
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
  renderProfile: RenderProfile,
  dimensions: VideoDimensions
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
  let veoPaidCalls = 0;
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

    const wantNativeAudio =
      scene.audioPolicy === "veo_native_audio" && process.env.GEMINI_VEO_AUDIO === "1";
    const beatReq: VideoBeatRequest = {
      sceneId: scene.sceneId,
      prompt: wantNativeAudio
        ? scene.veoPrompt
        : sanitizeVeoPromptForExternalAudio(scene.veoPrompt),
      aspectRatio: input.aspectRatio === "16:9" ? "16:9" : "9:16",
      durationBucket: scene.durationBucket,
      durationSeconds: scene.durationSeconds,
      referenceImage,
      firstFrame,
      lastFrame,
      extendVideoHandle: extendHandle,
      generateAudio: wantNativeAudio
    };
    let result: VideoBeatResult;
    if (renderProfile.provider === "veo") {
      result = await withVeoInflightGate(
        {
          applySceneGap: veoPaidCalls > 0,
          log: async (event, message, meta) => {
            await ctx.log.log(event, message, meta);
          }
        },
        () => beatGenerator.generateBeat(beatReq, buildBeatHooks(ctx, scene, renderProfile.id))
      );
      veoPaidCalls += 1;
    } else {
      result = await beatGenerator.generateBeat(beatReq, buildBeatHooks(ctx, scene, renderProfile.id));
    }

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
  const finalized = await finalizeSceneClip(
    mixedPath,
    dir,
    "extend-chain",
    targetVideoDimensions(input.aspectRatio)
  );
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

  let assembledPath = finalized.path;
  let totalDurationSecondsOut = totalDurationSeconds;
  if (input.videoInsert?.gcsPath) {
    const spliced = await spliceExternalInsert(assembledPath, input.videoInsert, dir, dimensions, ctx.storage);
    assembledPath = spliced.path;
    totalDurationSecondsOut = spliced.durationSeconds;
    await ctx.log.log("render_video_insert", "External clip spliced into extend film", {
      insertAtSeconds: input.videoInsert.insertAtSeconds,
      audioSource: input.videoInsert.audioSource,
      totalDurationSeconds: totalDurationSecondsOut
    });
  }

  let finalPath = assembledPath;
  const musicScene = input.timeline.find((s) => s.music.gcsPath || s.music.signedUrl);
  const musicGcsPath = musicScene ? resolveGcsPath(ctx.storage, musicScene.music) : null;
  if (musicGcsPath) {
    const musicLocal = path.join(dir, `music-${nanoid(4)}${musicExtension(musicGcsPath)}`);
    await downloadMediaToFile(ctx.storage, musicGcsPath, musicLocal);
    finalPath = await muxMusicTrack(finalPath, musicLocal, dir);
  }

  finalPath = await burnKaraokeAndWatermark(finalPath, dir, dimensions, input, ctx.log);

  finalPath = await appendBrandingEndCard(
    finalPath,
    dir,
    dimensions,
    input.branding ?? null,
    ctx.storage,
    input.brandEndVoice ?? null
  );

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
      strategy: renderProfile.strategy,
      endCard: input.branding && shouldUseBusinessEndCard(input.branding) ? "business" : "Prompt2Spot",
      branding: input.branding ?? null,
      videoInsert: input.videoInsert
        ? {
            insertAtSeconds: input.videoInsert.insertAtSeconds,
            audioSource: input.videoInsert.audioSource,
            name: input.videoInsert.name
          }
        : null
    }
  });
  const finalSignedUrl = await ctx.storage.signedUrl(finalArtifact.gcsPath);

  await ctx.log.log("render_done", "Render Agent finished (extend chain)", {
    scenes: perScene.length,
    totalDurationSeconds: totalDurationSecondsOut,
    renderProfile: renderProfile.id
  });

  return {
    provider: provider.provider,
    perScene,
    finalArtifactId: finalArtifact.id,
    finalGcsPath: finalArtifact.gcsPath,
    finalSignedUrl,
    totalDurationSeconds: totalDurationSecondsOut,
    geminiOperations
  };
}

/** Env-only HeyGen credential (not stored as a Prisma ProviderType). */
function resolveHeygenCredential(): ProviderCredentialView | null {
  const secret = process.env.HEYGEN_API_KEY?.trim();
  if (!secret) return null;
  return {
    id: "env-heygen",
    type: "VIDEO",
    provider: "heygen",
    priority: 0,
    config: {
      ...(process.env.HEYGEN_VOICE_ID ? { voiceId: process.env.HEYGEN_VOICE_ID } : {}),
      ...(process.env.HEYGEN_API_BASE ? { baseUrl: process.env.HEYGEN_API_BASE } : {})
    },
    secret
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
    onRateLimitWait: async (info) => {
      await ctx.log.log("veo_rate_limit_wait", "Waiting after Gemini/Veo 429 before retry", {
        sceneId: scene.sceneId,
        attempt: info.attempt,
        maxAttempts: info.maxAttempts,
        delayMs: info.delayMs,
        phase: info.phase,
        renderProfile: renderProfileId ?? null
      });
    },
    onUsage: async (event) => {
      await ctx.cost.record({
        activityType: event.activityType as "veo_video",
        sceneId: event.sceneId ?? scene.sceneId,
        model: event.model,
        durationMs: event.durationMs ?? null,
        billedUnits: event.billedUnits ?? Number(scene.durationBucket) ?? 0,
        unit: (event.unit as "veo_seconds") ?? "veo_seconds",
        charged: event.charged ?? "unknown",
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

  const voiceTracks: Array<{ path: string; delayMs: number; sceneDur: number }> = [];
  for (const scene of timeline) {
    if (!shouldUseVoice(scene)) continue;
    const voiceGcsPath = resolveGcsPath(storage, scene.voice);
    if (!voiceGcsPath) continue;
    const voiceLocal = path.join(dir, `voice-${scene.sceneId}-${nanoid(4)}.audio`);
    await downloadMediaToFile(storage, voiceGcsPath, voiceLocal);
    voiceTracks.push({
      path: voiceLocal,
      delayMs: Math.round(scene.startSecond * 1000),
      sceneDur: Math.max(0.2, scene.durationSeconds)
    });
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
    const sceneDur = track.sceneDur;
    const startSec = (delay / 1000).toFixed(3);
    const endSec = (delay / 1000 + sceneDur).toFixed(3);
    // Hard gate: voice is audible only inside its scene window — prevents chorus/overlap.
    filterParts.push(
      `[${i + 1}:a]atrim=0:${sceneDur},asetpts=PTS-STARTPTS,adelay=${delay}|${delay}:all=1,` +
        `volume=enable='between(t\\,${startSec}\\,${endSec})':volume=1,` +
        `afade=t=out:st=${Math.max(0, sceneDur - 0.05).toFixed(3)}:d=0.05,` +
        `apad=whole_dur=${videoDur}[v${i}]`
    );
  }

  const mixInputs = voiceTracks.map((_, i) => `[v${i}]`).join("");
  filterParts.push(
    `${mixInputs}amix=inputs=${voiceTracks.length}:duration=first:dropout_transition=0:normalize=0,atrim=0:${videoDur},asetpts=PTS-STARTPTS[aout]`
  );

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
  storage: GcsClient,
  options?: { keepProviderAudio?: boolean }
): Promise<string> {
  if (options?.keepProviderAudio || scene.audioPolicy === "veo_native_audio") {
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
  const voiceDur = await probeDuration(voiceLocal).catch(() => 0);
  const out = path.join(dir, `${path.basename(videoPath, ".mp4")}-voice.mp4`);
  // Fit narration into the clip window: mild atempo when slightly long, then pad/trim — never spill past videoDur.
  const audioFilter = fitVoiceToVideoFilter(voiceDur, videoDur);
  await runFfmpeg([
    "-i",
    videoPath,
    "-i",
    voiceLocal,
    "-filter_complex",
    `${audioFilter}[aout]`,
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

/** Build ffmpeg audio filter that keeps voice inside [0, videoDur] without hard mid-word cuts when possible. */
function fitVoiceToVideoFilter(voiceDur: number, videoDur: number): string {
  const target = Math.max(0.2, videoDur);
  const fadeSt = Math.max(0, target - 0.06).toFixed(3);
  if (!(voiceDur > 0) || !Number.isFinite(voiceDur)) {
    return `[1:a]atrim=0:${target},asetpts=PTS-STARTPTS,afade=t=out:st=${fadeSt}:d=0.05,apad=whole_dur=${target}`;
  }
  if (voiceDur <= target + 0.05) {
    return `[1:a]asetpts=PTS-STARTPTS,afade=t=out:st=${fadeSt}:d=0.05,apad=whole_dur=${target},atrim=0:${target}`;
  }
  // Speed up slightly (max ~1.35x) so long lines still fit; then hard-trim if still over.
  const tempo = Math.min(1.35, voiceDur / target);
  const chain: string[] = ["[1:a]asetpts=PTS-STARTPTS"];
  if (tempo > 1.02) {
    // atempo only accepts 0.5–2.0
    chain.push(`atempo=${tempo.toFixed(3)}`);
  }
  chain.push(`atrim=0:${target}`, `afade=t=out:st=${fadeSt}:d=0.05`, `apad=whole_dur=${target}`);
  return chain.join(",");
}

async function stripAudio(videoPath: string, dir: string): Promise<string> {
  const out = path.join(dir, `${path.basename(videoPath, ".mp4")}-silent.mp4`);
  await runFfmpeg(["-i", videoPath, "-map", "0:v:0", "-c:v", "copy", "-an", "-movflags", "+faststart", "-y", out]);
  return out;
}

const INSERT_FADE_SECONDS = 0.65;
const MAX_INSERT_CLIP_SECONDS = 20;

/**
 * Splice a short external clip into an assembled film at insertAtSeconds,
 * with soft xfade/acrossfade in and out. audioSource=clip keeps insert audio;
 * narration mutes the insert so studio voice around it remains the focus.
 */
async function spliceExternalInsert(
  mainPath: string,
  insert: NonNullable<RenderInput["videoInsert"]>,
  dir: string,
  dimensions: VideoDimensions,
  storage: GcsClient
): Promise<{ path: string; durationSeconds: number }> {
  const rawInsert = path.join(dir, `insert-raw-${nanoid(4)}.mp4`);
  await downloadMediaToFile(storage, insert.gcsPath, rawInsert);

  const capped = path.join(dir, `insert-capped-${nanoid(4)}.mp4`);
  await runFfmpeg([
    "-i",
    rawInsert,
    "-t",
    String(MAX_INSERT_CLIP_SECONDS),
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-y",
    capped
  ]).catch(async () => {
    await runFfmpeg([
      "-i",
      rawInsert,
      "-t",
      String(MAX_INSERT_CLIP_SECONDS),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-y",
      capped
    ]);
  });

  let insertPrepared = (await finalizeSceneClip(capped, dir, "insert-clip", dimensions)).path;
  if (insert.audioSource === "narration") {
    const silent = await stripAudio(insertPrepared, dir);
    insertPrepared = (await finalizeSceneClip(silent, dir, "insert-silent", dimensions)).path;
  }

  const mainDur = await probeDuration(mainPath);
  const insertDur = await probeDuration(insertPrepared);
  const fade = Math.min(INSERT_FADE_SECONDS, Math.max(0.25, Math.min(mainDur, insertDur) * 0.35));
  const minAt = fade + 0.05;
  const maxAt = Math.max(minAt, mainDur - fade - 0.05);
  const at = Math.min(maxAt, Math.max(minAt, Number(insert.insertAtSeconds) || 0));

  const leftRaw = path.join(dir, `insert-left-${nanoid(4)}.mp4`);
  const rightRaw = path.join(dir, `insert-right-${nanoid(4)}.mp4`);

  if (at > 0.08) {
    await runFfmpeg([
      "-i",
      mainPath,
      "-t",
      at.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-y",
      leftRaw
    ]);
  }
  if (at < mainDur - 0.08) {
    await runFfmpeg([
      "-ss",
      at.toFixed(3),
      "-i",
      mainPath,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-y",
      rightRaw
    ]);
  }

  const leftExists = at > 0.08 && existsSync(leftRaw);
  const rightExists = at < mainDur - 0.08 && existsSync(rightRaw);

  let current = insertPrepared;
  let currentDur = insertDur;

  if (leftExists) {
    const left = (await finalizeSceneClip(leftRaw, dir, "insert-left", dimensions)).path;
    const leftDur = await probeDuration(left);
    const merged = path.join(dir, `insert-merge-l-${nanoid(4)}.mp4`);
    const stepFade = Math.min(fade, Math.max(0.2, Math.min(leftDur, currentDur) * 0.35));
    await mergeTwoClipsWithXfade(left, current, leftDur, currentDur, stepFade, merged);
    current = merged;
    currentDur = leftDur + currentDur - stepFade;
  }

  if (rightExists) {
    const right = (await finalizeSceneClip(rightRaw, dir, "insert-right", dimensions)).path;
    const rightDur = await probeDuration(right);
    const merged = path.join(dir, `insert-merge-r-${nanoid(4)}.mp4`);
    const stepFade = Math.min(fade, Math.max(0.2, Math.min(currentDur, rightDur) * 0.35));
    await mergeTwoClipsWithXfade(current, right, currentDur, rightDur, stepFade, merged);
    current = merged;
    currentDur = currentDur + rightDur - stepFade;
  }

  const out = path.join(dir, `with-insert-${nanoid(4)}.mp4`);
  await runFfmpeg(["-i", current, "-c", "copy", "-movflags", "+faststart", "-y", out]);
  return { path: out, durationSeconds: await probeDuration(out) };
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

const BRANDING_END_CARD_SECONDS = 2.8;
const BRANDING_END_CARD_WITH_VOICE_SECONDS = 5.5;
const BRANDING_END_FADE_SECONDS = 0.85;
const BRANDING_END_TEXT = "prompt2spot.com";

function resolveBrandingOutroImage(): string | null {
  const envPath = process.env.BRANDING_OUTRO_IMAGE?.trim();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    envPath,
    path.join(here, "..", "assets", "prompt2spot-outro.png"),
    path.join(process.cwd(), "packages", "agents", "render", "assets", "prompt2spot-outro.png"),
    path.join(process.cwd(), "assets", "prompt2spot-outro.png")
  ].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveDrawtextFont(): string | null {
  const envPath = process.env.BRANDING_FONT?.trim();
  const candidates = [
    envPath,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf"
  ].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/%/g, "%%")
    .replace(/\r?\n/g, " ");
}

function shouldUseBusinessEndCard(branding: BriefBrandingOutput | null | undefined): boolean {
  if (!branding) return false;
  if (branding.logoPlacement === "none") return false;
  return Boolean(
    branding.businessName?.trim() ||
      branding.slogan?.trim() ||
      branding.websiteUrl?.trim() ||
      branding.logo?.gcsPath
  );
}

async function createBusinessEndCardClip(
  dir: string,
  dimensions: VideoDimensions,
  branding: BriefBrandingOutput,
  storage: GcsClient,
  brandVoice?: { gcsPath: string; durationSeconds?: number | null } | null
): Promise<string> {
  const endClip = path.join(dir, `biz-end-${nanoid(4)}.mp4`);
  const { width, height } = dimensions;
  const name = branding.businessName?.trim() || "";
  const slogan = branding.slogan?.trim() || "";
  const website = (branding.websiteUrl?.trim() || "").replace(/^https?:\/\//i, "");
  const font = resolveDrawtextFont();
  const fontOpt = font ? `:fontfile='${font.replace(/\\/g, "/").replace(/:/g, "\\:")}'` : "";
  const nameSize = Math.max(28, Math.round(Math.min(width, height) * 0.06));
  const sloganSize = Math.max(18, Math.round(Math.min(width, height) * 0.035));
  const urlSize = Math.max(16, Math.round(Math.min(width, height) * 0.032));
  const creditSize = Math.max(14, Math.round(Math.min(width, height) * 0.028));
  const logoMax = Math.round(Math.min(width, height) * 0.28);
  const hasLogo = Boolean(branding.logo?.gcsPath);
  const voiceDur = Number(brandVoice?.durationSeconds);
  const cardSeconds = brandVoice?.gcsPath
    ? Math.min(8, Math.max(BRANDING_END_CARD_WITH_VOICE_SECONDS, Number.isFinite(voiceDur) && voiceDur > 0 ? voiceDur + 0.4 : BRANDING_END_CARD_WITH_VOICE_SECONDS))
    : BRANDING_END_CARD_SECONDS;

  let logoLocal: string | null = null;
  if (hasLogo && branding.logo?.gcsPath) {
    const ext = path.extname(branding.logo.name) || ".png";
    logoLocal = path.join(dir, `biz-logo-${nanoid(4)}${ext}`);
    await downloadMediaToFile(storage, branding.logo.gcsPath, logoLocal);
  }

  let voiceLocal: string | null = null;
  if (brandVoice?.gcsPath) {
    voiceLocal = path.join(dir, `biz-voice-${nanoid(4)}${musicExtension(brandVoice.gcsPath)}`);
    await downloadMediaToFile(storage, brandVoice.gcsPath, voiceLocal);
  }

  const drawParts: string[] = [];
  if (name) {
    const y = hasLogo ? `(h/2)+${Math.round(logoMax * 0.55)}` : `(h-text_h)/2-${Math.round(nameSize * 0.4)}`;
    drawParts.push(
      `drawtext=text='${escapeDrawtext(name)}'${fontOpt}:fontsize=${nameSize}:fontcolor=white:x=(w-text_w)/2:y=${y}`
    );
  }
  if (slogan) {
    const y = hasLogo
      ? `(h/2)+${Math.round(logoMax * 0.55 + nameSize * 1.35)}`
      : name
        ? `(h-text_h)/2+${Math.round(nameSize * 0.9)}`
        : `(h-text_h)/2`;
    drawParts.push(
      `drawtext=text='${escapeDrawtext(slogan)}'${fontOpt}:fontsize=${sloganSize}:fontcolor=white@0.88:x=(w-text_w)/2:y=${y}`
    );
  }
  if (website) {
    const yBase = hasLogo
      ? Math.round(logoMax * 0.55 + nameSize * 1.35 + (slogan ? sloganSize * 1.4 : 0))
      : Math.round(nameSize * (slogan ? 2.2 : 0.9));
    const y = hasLogo ? `(h/2)+${yBase}` : name || slogan ? `(h-text_h)/2+${yBase}` : `(h-text_h)/2`;
    drawParts.push(
      `drawtext=text='${escapeDrawtext(website)}'${fontOpt}:fontsize=${urlSize}:fontcolor=0x7ab5ff:x=(w-text_w)/2:y=${y}`
    );
  }
  drawParts.push(
    `drawtext=text='${escapeDrawtext(BRANDING_END_TEXT)}'${fontOpt}:fontsize=${creditSize}:fontcolor=white@0.55:x=(w-text_w)/2:y=h-th-${Math.round(height * 0.06)}`
  );

  const audioArgs = voiceLocal
    ? ["-i", voiceLocal]
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

  if (logoLocal) {
    const filter = [
      `[0:v]scale=${width}:${height},format=yuv420p[bg]`,
      `[1:v]scale=w='min(iw\\,${logoMax})':h='min(ih\\,${logoMax})':force_original_aspect_ratio=decrease[logo]`,
      `[bg][logo]overlay=(W-w)/2:(H-h)/2-${Math.round(logoMax * 0.35)},fade=t=in:st=0:d=0.35[base]`,
      `[base]${drawParts.join(",")}[vout]`
    ].join(";");
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      `color=c=0x0d1117:s=${width}x${height}:d=${cardSeconds}`,
      "-loop",
      "1",
      "-i",
      logoLocal,
      ...audioArgs,
      "-filter_complex",
      filter,
      "-map",
      "[vout]",
      "-map",
      "2:a",
      "-t",
      String(cardSeconds),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      "-y",
      endClip
    ]);
    return endClip;
  }

  const vf = [`scale=${width}:${height}`, "format=yuv420p", "fade=t=in:st=0:d=0.35", ...drawParts].join(",");
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    `color=c=0x0d1117:s=${width}x${height}:d=${cardSeconds}`,
    ...audioArgs,
    "-t",
    String(cardSeconds),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    "-y",
    endClip
  ]);
  return endClip;
}

async function createEndCardClip(dir: string, dimensions: VideoDimensions, lastFramePath: string): Promise<string> {
  const endClip = path.join(dir, `end-card-${nanoid(4)}.mp4`);
  const branded = resolveBrandingOutroImage();
  const sourceImage = branded ?? lastFramePath;
  const vf = branded
    ? normalizeVideoFilter(dimensions.width, dimensions.height)
    : [
        normalizeVideoFilter(dimensions.width, dimensions.height),
        "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill",
        "fade=t=in:st=0:d=0.35",
        `drawtext=text='${escapeDrawtext(BRANDING_END_TEXT)}':fontsize=${Math.max(28, Math.round(Math.min(dimensions.width, dimensions.height) * 0.055))}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`
      ].join(",");

  await runFfmpeg([
    "-loop",
    "1",
    "-i",
    sourceImage,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(BRANDING_END_CARD_SECONDS),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    "-y",
    endClip
  ]);
  return endClip;
}

function escapeFfmpegPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function assFontNameFromPath(fontPath: string | null): string {
  if (!fontPath) return "Arial";
  const base = path.basename(fontPath).toLowerCase();
  if (base.includes("dejavu")) return "DejaVu Sans";
  if (base.includes("liberation")) return "Liberation Sans";
  if (base.includes("noto")) return "Noto Sans";
  if (base.includes("segoe")) return "Segoe UI";
  if (base.includes("arial")) return "Arial";
  return "Arial";
}

/** Full-frame kinetic text beat (no talking head / no paid video API). */
async function createTitleCardClip(
  dir: string,
  dimensions: VideoDimensions,
  scene: SceneTimelineEntry
): Promise<string> {
  const out = path.join(dir, `title-${scene.order}-${nanoid(4)}.mp4`);
  const { width, height } = dimensions;
  const duration = Math.min(5, Math.max(3, scene.durationSeconds || 4));
  const headline = (scene.title || scene.narration || " ").trim() || " ";
  const sub =
    (scene.narration || "").trim() && scene.narration.trim() !== headline ? scene.narration.trim() : "";

  const baseArgs = (vf: string) =>
    [
      "-f",
      "lavfi",
      "-i",
      `color=c=0x101820:s=${width}x${height}:d=${duration}`,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-t",
      String(duration),
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      "-y",
      out
    ] as string[];

  try {
    const font = resolveDrawtextFont();
    const ass = buildTitleCardAss(
      { headline, subtitle: sub || undefined, durationSeconds: duration, width, height },
      { fontName: assFontNameFromPath(font) }
    );
    const assPath = path.join(dir, `title-card-${nanoid(4)}.ass`);
    await writeFile(assPath, ass, "utf8");
    const assEsc = escapeFfmpegPath(assPath);
    const fontsDir = font ? path.dirname(font) : null;
    const fontsEsc = fontsDir ? escapeFfmpegPath(fontsDir) : null;
    const vf = fontsEsc
      ? `format=yuv420p,fade=t=in:st=0:d=0.35,ass='${assEsc}':fontsdir='${fontsEsc}'`
      : `format=yuv420p,fade=t=in:st=0:d=0.35,ass='${assEsc}'`;
    await runFfmpeg(baseArgs(vf));
    return out;
  } catch {
    // Soft-fail: solid card without text so render can continue.
    await runFfmpeg(baseArgs("format=yuv420p,fade=t=in:st=0:d=0.35"));
    return out;
  }
}

async function burnKaraokeAndWatermark(
  videoPath: string,
  dir: string,
  dimensions: VideoDimensions,
  input: RenderInput,
  log: AgentContext["log"]
): Promise<string> {
  const wantKaraoke = Boolean(input.karaokeCaptions);
  const wantMark = Boolean(input.sideWatermark);
  const wantLower = Boolean(input.lowerThirds);
  if (!wantKaraoke && !wantMark && !wantLower) return videoPath;

  try {
    const filters: string[] = [];
    let assPath: string | null = null;
    if (wantKaraoke) {
      const cues: KaraokeLineCue[] = input.timeline.flatMap((scene) =>
        (scene.captionCues ?? []).map((cue) => ({
          text: cue.text,
          startSecond: cue.startSecond,
          endSecond: cue.endSecond,
          words: cue.words ?? []
        }))
      );
      if (cues.length) {
        const font = resolveDrawtextFont();
        const ass = buildKaraokeAss(cues, {
          fontName: assFontNameFromPath(font),
          language: input.language,
          rtl: undefined
        });
        assPath = path.join(dir, `karaoke-${nanoid(4)}.ass`);
        await writeFile(assPath, ass, "utf8");
        const fontsDir = font ? path.dirname(font) : null;
        const assEsc = escapeFfmpegPath(assPath);
        const fontsEsc = fontsDir ? escapeFfmpegPath(fontsDir) : null;
        filters.push(fontsEsc ? `ass='${assEsc}':fontsdir='${fontsEsc}'` : `ass='${assEsc}'`);
      }
    }

    if (wantMark) {
      const mark =
        input.branding?.businessName?.trim() ||
        input.branding?.slogan?.trim() ||
        "prompt2spot.com";
      const font = resolveDrawtextFont();
      const fontOpt = font ? `:fontfile='${escapeFfmpegPath(font)}'` : "";
      const size = Math.max(18, Math.round(Math.min(dimensions.width, dimensions.height) * 0.028));
      filters.push(
        `drawtext=text='${escapeDrawtext(mark)}'${fontOpt}:fontsize=${size}:fontcolor=white@0.38:x=${Math.round(dimensions.width * 0.035)}:y=(h+text_w)/2:angle=-PI/2`
      );
    }

    if (wantLower) {
      const font = resolveDrawtextFont();
      const fontOpt = font ? `:fontfile='${escapeFfmpegPath(font)}'` : "";
      const titleSize = Math.max(22, Math.round(Math.min(dimensions.width, dimensions.height) * 0.042));
      const subSize = Math.max(16, Math.round(titleSize * 0.72));
      const brand = input.branding?.businessName?.trim() || "";
      const barH = Math.round(dimensions.height * 0.14);
      const yTitle = dimensions.height - barH + Math.round(barH * 0.22);
      const ySub = yTitle + titleSize + Math.round(barH * 0.08);
      for (const scene of input.timeline) {
        if (scene.sceneKind === "title_card") continue;
        const title = String(scene.title ?? "").trim().slice(0, 48);
        if (!title) continue;
        const start = Math.max(0, scene.startSecond);
        const end = Math.min(scene.endSecond, start + 2.8);
        if (end <= start + 0.2) continue;
        const enable = `enable='between(t\\,${start.toFixed(2)}\\,${end.toFixed(2)})'`;
        filters.push(`drawbox=x=0:y=h-${barH}:w=w:h=${barH}:color=black@0.55:t=fill:${enable}`);
        filters.push(
          `drawtext=text='${escapeDrawtext(title)}'${fontOpt}:fontsize=${titleSize}:fontcolor=white:x=${Math.round(dimensions.width * 0.05)}:y=${yTitle}:${enable}`
        );
        if (brand) {
          filters.push(
            `drawtext=text='${escapeDrawtext(brand)}'${fontOpt}:fontsize=${subSize}:fontcolor=white@0.85:x=${Math.round(dimensions.width * 0.05)}:y=${ySub}:${enable}`
          );
        }
      }
    }

    if (!filters.length) return videoPath;

    const out = path.join(dir, `overlay-${nanoid(4)}.mp4`);
    await runFfmpeg([
      "-i",
      videoPath,
      "-vf",
      filters.join(","),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      "-y",
      out
    ]);
    await log.log("render_overlays", "Burned karaoke/watermark/lower-third overlays", {
      karaoke: wantKaraoke && Boolean(assPath),
      sideWatermark: wantMark,
      lowerThirds: wantLower
    });
    return out;
  } catch (error) {
    await log.log("render_overlays_failed", "Overlay burn-in failed; continuing without", {
      error: error instanceof Error ? error.message : String(error)
    });
    return videoPath;
  }
}

/**
 * Fade from the last frame into branding outro (business card or Prompt2Spot).
 * Best-effort: on failure returns the input video unchanged.
 */
async function appendBrandingEndCard(
  videoPath: string,
  dir: string,
  dimensions: VideoDimensions,
  branding: BriefBrandingOutput | null | undefined,
  storage: GcsClient,
  brandVoice?: { gcsPath: string; durationSeconds?: number | null } | null
): Promise<string> {
  try {
    const lastFrame = path.join(dir, `end-last-${nanoid(4)}.png`);
    await runFfmpeg(["-sseof", "-0.08", "-i", videoPath, "-frames:v", "1", "-y", lastFrame]);
    const endClip = shouldUseBusinessEndCard(branding)
      ? await createBusinessEndCardClip(dir, dimensions, branding!, storage, brandVoice)
      : await createEndCardClip(dir, dimensions, lastFrame);

    const out = path.join(dir, `with-end-${nanoid(4)}.mp4`);
    const mainDur = await probeDuration(videoPath);
    const fade = Math.min(BRANDING_END_FADE_SECONDS, Math.max(0.2, mainDur / 3));
    const offset = Math.max(0, mainDur - fade);

    try {
      const filter = `[0:v][1:v]xfade=transition=fade:duration=${fade}:offset=${offset}[vout];[0:a][1:a]acrossfade=d=${fade}[aout]`;
      await runFfmpeg([
        "-i",
        videoPath,
        "-i",
        endClip,
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
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-y",
        out
      ]);
      return out;
    } catch {
      await concatClipsHardCut([videoPath, endClip], out, dimensions);
      return out;
    }
  } catch {
    return videoPath;
  }
}

async function concatClips(
  clipPaths: string[],
  outputPath: string,
  dir: string,
  clipDurations: number[] | undefined,
  dimensions: VideoDimensions
): Promise<void> {
  if (clipPaths.length === 0) {
    throw new Error("Cannot concat: no clips rendered");
  }

  const prepared = await Promise.all(
    clipPaths.map(async (clipPath, index) => {
      const info = await stat(clipPath).catch(() => null);
      if (!info || info.size < 512) {
        throw new Error(`Rendered clip ${index + 1} is empty or missing (${clipPath})`);
      }
      return (await finalizeSceneClip(clipPath, dir, `concat-prep-${index}`, dimensions)).path;
    })
  );

  if (prepared.length === 1) {
    await runFfmpeg(["-i", prepared[0]!, "-c", "copy", "-movflags", "+faststart", "-y", outputPath]);
    return;
  }

  const durations =
    clipDurations?.length === prepared.length
      ? clipDurations
      : await Promise.all(prepared.map((p) => probeDuration(p)));
  for (const [index, dur] of durations.entries()) {
    if (!Number.isFinite(dur) || dur <= 0.05) {
      throw new Error(`Invalid clip duration (${dur}) for clip ${index + 1} — cannot concat`);
    }
  }

  const xfadeSeconds = sceneXfadeSeconds(prepared.length);
  if (xfadeSeconds > 0) {
    try {
      await concatClipsWithXfade(prepared, outputPath, durations, xfadeSeconds, dir, dimensions);
      return;
    } catch {
      // Pairwise / filter xfade can fail on long timelines — fall back to hard cuts.
    }
  }

  await concatClipsHardCut(prepared, outputPath, dimensions);
}

type VideoDimensions = { width: number; height: number };

function targetVideoDimensions(aspectRatio: string): VideoDimensions {
  if (aspectRatio === "16:9") return { width: 1280, height: 720 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 720, height: 1280 };
}

function normalizeVideoFilter(width: number, height: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`;
}

/** Join normalized clips — scales each input so Kling/Veo dimension mismatches cannot break concat. */
async function concatClipsHardCut(prepared: string[], outputPath: string, dimensions: VideoDimensions): Promise<void> {
  const n = prepared.length;
  const vf = normalizeVideoFilter(dimensions.width, dimensions.height);
  const parts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    parts.push(`[${i}:v:0]${vf},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[${i}:a:0]aformat=sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
  }
  const vCat = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
  const aCat = Array.from({ length: n }, (_, i) => `[a${i}]`).join("");
  const filter = `${parts.join(";")};${vCat}${aCat}concat=n=${n}:v=1:a=1[vout][aout]`;
  const inputs: string[] = [];
  for (const clip of prepared) {
    inputs.push("-i", clip);
  }
  try {
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
  } catch (error) {
    const listPath = path.join(path.dirname(outputPath), `concat-fallback-${nanoid(4)}.txt`);
    await writeFile(
      listPath,
      prepared.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
      "utf8"
    );
    await runFfmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-vf",
      vf,
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
}

function sceneXfadeSeconds(clipCount: number): number {
  // Crossfades blend adjacent clip audio and read as two people speaking at once — keep hard cuts.
  const value = Number(process.env.RENDER_SCENE_XFADE_SECONDS ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (clipCount > 6) return 0;
  return Math.min(value, 1.5);
}

async function concatClipsWithXfade(
  clipPaths: string[],
  outputPath: string,
  durations: number[],
  xfadeSeconds: number,
  dir: string,
  dimensions: VideoDimensions
): Promise<void> {
  const normalized = await Promise.all(
    clipPaths.map(async (clipPath, index) => {
      if (await probeHasAudio(clipPath)) return clipPath;
      return (await finalizeSceneClip(clipPath, path.dirname(clipPath), `xfade-audio-${index}`, dimensions)).path;
    })
  );

  const minDur = Math.min(...durations);
  const fade = Math.min(xfadeSeconds, Math.max(0.1, minDur * 0.25));

  let currentPath = normalized[0]!;
  let currentDur = durations[0]!;

  for (let i = 1; i < normalized.length; i += 1) {
    const stepOut = path.join(dir, `xfade-merge-${i}-${nanoid(4)}.mp4`);
    await mergeTwoClipsWithXfade(
      currentPath,
      normalized[i]!,
      currentDur,
      durations[i]!,
      fade,
      stepOut
    );
    currentPath = stepOut;
    currentDur = currentDur + durations[i]! - fade;
  }

  if (currentPath === outputPath) return;
  await runFfmpeg(["-i", currentPath, "-c", "copy", "-movflags", "+faststart", "-y", outputPath]);
}

async function mergeTwoClipsWithXfade(
  leftPath: string,
  rightPath: string,
  leftDur: number,
  rightDur: number,
  fade: number,
  outputPath: string
): Promise<void> {
  void rightDur;
  const offset = Math.max(0, leftDur - fade);
  await runFfmpeg([
    "-i",
    leftPath,
    "-i",
    rightPath,
    "-filter_complex",
    `[0:v:0][1:v:0]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=${offset.toFixed(3)}[vout];` +
      `[0:a:0][1:a:0]acrossfade=d=${fade.toFixed(3)}:c1=tri:c2=tri[aout]`,
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

/** Normalize each scene clip to the same codec, resolution, fps, and ensure an audio track exists. */
async function finalizeSceneClip(
  inputPath: string,
  dir: string,
  sceneId: string,
  dimensions: VideoDimensions
): Promise<{ path: string; durationSeconds: number }> {
  const rawDur = await probeDuration(inputPath);
  const dur = Math.max(0.1, rawDur);
  const hasAudio = await probeHasAudio(inputPath);
  const out = path.join(dir, `scene-final-${sceneId}-${nanoid(4)}.mp4`);
  const vf = normalizeVideoFilter(dimensions.width, dimensions.height);
  if (hasAudio) {
    await runFfmpeg([
      "-i",
      inputPath,
      "-vf",
      vf,
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
      "-vf",
      vf,
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
  const bin = resolveFfmpegBinary();
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
      reject(new Error(`ffmpeg probe exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function resolveFfmpegBinary(): string {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync("/usr/bin/ffmpeg")) return "/usr/bin/ffmpeg";
  return (ffmpegStatic as unknown as string) ?? "ffmpeg";
}

async function runFfmpeg(args: string[]): Promise<void> {
  const bin = resolveFfmpegBinary();
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
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

async function loadExistingSceneClips(
  ctx: AgentContext
): Promise<Map<string, { artifact: ArtifactRecord; promptHash?: string }>> {
  const rows = await ctx.artifacts.list(ctx.runId, "render");
  const map = new Map<string, { artifact: ArtifactRecord; promptHash?: string }>();
  for (const row of rows) {
    if (row.kind !== "scene_rendered_clip") continue;
    const sceneId = row.metadata.sceneId;
    if (typeof sceneId !== "string" || !sceneId) continue;
    map.set(sceneId, {
      artifact: row,
      promptHash: typeof row.metadata.promptHash === "string" ? row.metadata.promptHash : undefined
    });
  }
  return map;
}
