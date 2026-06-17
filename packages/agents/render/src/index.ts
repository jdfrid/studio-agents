import { geminiGenerateVeoVideo, stablePromptHash } from "@studio/providers";
import {
  NoProviderConfiguredError,
  RenderInputSchema,
  RenderOutputSchema,
  type Agent,
  type RenderInput,
  type RenderOutput,
  type RenderSceneResult
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

        const muxedPath = path.join(dir, `scene-${scene.order}.mp4`);
        await writeFile(muxedPath, result.videoBytes);

        if (scene.music.signedUrl) {
          const withMusic = await muxMusic(muxedPath, scene.music.signedUrl, scene.durationSeconds, dir);
          clipFiles.push(withMusic);
        } else {
          clipFiles.push(muxedPath);
        }

        const clipArtifact = await ctx.artifacts.save({
          runId: ctx.runId,
          stage: "render",
          kind: "scene_rendered_clip",
          body: await readFile(clipFiles[clipFiles.length - 1]!),
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

      const finalPath = path.join(dir, `final-${nanoid(8)}.mp4`);
      await concatClips(clipFiles, finalPath, dir);
      const finalArtifact = await ctx.artifacts.save({
        runId: ctx.runId,
        stage: "render",
        kind: "final_video",
        body: await readFile(finalPath),
        mimeType: "video/mp4",
        filename: `final-${ctx.runId}.mp4`
      });
      const finalSignedUrl = await ctx.storage.signedUrl(finalArtifact.gcsPath);

      const totalDurationSeconds = perScene.reduce((sum, s) => sum + s.durationSeconds, 0);
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

async function muxMusic(videoPath: string, musicUrl: string, durationSeconds: number, dir: string): Promise<string> {
  const out = path.join(dir, `${path.basename(videoPath, ".mp4")}-music.mp4`);
  await runFfmpeg([
    "-i", videoPath,
    "-stream_loop", "-1", "-i", musicUrl,
    "-t", String(durationSeconds),
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-shortest",
    "-movflags", "+faststart",
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
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    "-movflags", "+faststart",
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
