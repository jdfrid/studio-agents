import { geminiGenerateVeoVideo, stablePromptHash } from "@studio/providers";
import {
  NoProviderConfiguredError,
  RenderInputSchema,
  RenderOutputSchema,
  type Agent,
  type RenderInput,
  type RenderOutput,
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
    await ctx.log.log("render_start", "Render Agent started", { sceneCount: input.timeline.length });

    const provider = await ctx.providers.primary("GEMINI");
    if (!provider) {
      throw new NoProviderConfiguredError("GEMINI");
    }
    await ctx.log.log("render_provider_selected", "Gemini/Veo provider selected", {
      provider: provider.provider,
      priority: provider.priority
    });

    const dir = path.join(tmpdir(), `studio-agents-${ctx.runId}-${nanoid(6)}`);
    await mkdir(dir, { recursive: true });

    const perScene: RenderSceneResult[] = [];
    const clipFiles: string[] = [];
    const geminiOperations: RenderOutput["geminiOperations"] = [];

    try {
      for (const scene of input.timeline) {
        const promptHash = stablePromptHash(scene.veoPrompt);
        await ctx.log.log("render_scene_start", "Rendering scene", { sceneId: scene.sceneId, order: scene.order });
        const result = await geminiGenerateVeoVideo(
          provider,
          {
            sceneId: scene.sceneId,
            prompt: scene.veoPrompt,
            aspectRatio: input.aspectRatio === "16:9" ? "16:9" : "9:16",
            durationBucket: scene.durationBucket,
            referenceImageUrl: scene.referenceFrame?.signedUrl ?? scene.background.signedUrl,
            firstFrameUrl: scene.firstFrame?.signedUrl ?? null,
            lastFrameUrl: scene.lastFrame?.signedUrl ?? null
          },
          async (operation) => {
            await ctx.log.log("gemini_veo_operation_status", "Gemini Veo operation status", {
              sceneId: scene.sceneId,
              operationName: operation.operationName,
              status: operation.status,
              model: operation.model,
              error: operation.error ?? null
            });
          }
        );
        if (!result.videoBytes) {
          throw new Error(`Gemini Veo completed without bytes for scene ${scene.sceneId}`);
        }
        geminiOperations.push({
          sceneId: scene.sceneId,
          operationName: result.operationName,
          status: result.status === "completed" ? "completed" : "failed",
          model: result.model,
          error: result.error ?? null
        });
        await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "render",
          kind: "gemini_operation",
          body: JSON.stringify({ sceneId: scene.sceneId, promptHash, operation: result }, null, 2),
          mimeType: "application/json",
          filename: `scene-${scene.order}-veo-operation.json`,
          metadata: {
            sceneId: scene.sceneId,
            operationName: result.operationName,
            model: result.model,
            promptHash,
            sourceStage: "render"
          }
        });

        const rawPath = path.join(dir, `scene-${scene.order}-raw.mp4`);
        await writeFile(rawPath, result.videoBytes);
        const scenePath = await mixSceneAudio(rawPath, scene, dir);
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
            provider: "gemini-veo",
            model: result.model,
            order: scene.order,
            geminiOperationName: result.operationName,
            promptHash
          }
        });

        perScene.push({
          sceneId: scene.sceneId,
          artifactId: clipArtifact.id,
          gcsPath: clipArtifact.gcsPath,
          durationSeconds: scene.durationSeconds,
          provider: "gemini-veo",
          model: result.model,
          geminiOperationName: result.operationName,
          promptHash
        });
      }

      const concatPath = path.join(dir, `concat-${nanoid(8)}.mp4`);
      await concatClips(clipFiles, concatPath, dir);

      const musicUrl = input.timeline.find((s) => s.music.signedUrl)?.music.signedUrl ?? null;
      const totalDurationSeconds = perScene.reduce((sum, s) => sum + s.durationSeconds, 0);
      let finalPath = concatPath;
      if (musicUrl) {
        const musicLocal = path.join(dir, `music-${nanoid(4)}${musicExtension(musicUrl)}`);
        await fetchToFile(musicUrl, musicLocal);
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
        filename: `final-${ctx.runId}.mp4`
      });
      const finalSignedUrl = await ctx.storage.signedUrl(finalArtifact.gcsPath);

      await ctx.log.log("render_done", "Render Agent finished", { scenes: perScene.length, totalDurationSeconds });
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

function shouldUseVoice(scene: SceneTimelineEntry): boolean {
  const policy = scene.audioPolicy ?? "gemini_tts_plus_music";
  return policy !== "muted" && policy !== "veo_native_audio" && Boolean(scene.voice.signedUrl);
}

async function mixSceneAudio(videoPath: string, scene: SceneTimelineEntry, dir: string): Promise<string> {
  if (scene.audioPolicy === "veo_native_audio") {
    return videoPath;
  }
  if (!shouldUseVoice(scene) || !scene.voice.signedUrl) {
    return stripAudio(videoPath, dir);
  }
  const voiceLocal = path.join(dir, `voice-${scene.sceneId}-${nanoid(4)}.audio`);
  await fetchToFile(scene.voice.signedUrl, voiceLocal);
  const out = path.join(dir, `${path.basename(videoPath, ".mp4")}-voice.mp4`);
  await runFfmpeg([
    "-i",
    videoPath,
    "-i",
    voiceLocal,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
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
  await runFfmpeg([
    "-i",
    videoPath,
    "-stream_loop",
    "-1",
    "-i",
    musicPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-map",
    "1:a:0",
    "-filter_complex",
    "[0:a]volume=1.0[voice];[1:a]volume=0.28[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=0[aout]",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    "-y",
    out
  ]).catch(async () => {
    await runFfmpeg([
      "-i",
      videoPath,
      "-stream_loop",
      "-1",
      "-i",
      musicPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-filter:a",
      "volume=0.35",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      "-y",
      out
    ]);
  });
  return out;
}

function musicExtension(url: string): string {
  if (url.includes(".wav")) return ".wav";
  if (url.includes(".mp3") || url.includes("mpeg")) return ".mp3";
  return ".audio";
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
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

async function concatClips(clipPaths: string[], outputPath: string, dir: string): Promise<void> {
  if (clipPaths.length === 0) {
    throw new Error("Cannot concat: no clips rendered");
  }
  const listPath = path.join(dir, `concat-${nanoid(6)}.txt`);
  await writeFile(
    listPath,
    clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
    "utf8"
  );
  await runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-y",
    outputPath
  ]);
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
