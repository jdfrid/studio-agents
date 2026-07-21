import { prisma } from "@studio/infra-prisma";
import {
  SeriesInputSchema,
  SeriesOutputSchema,
  type Agent,
  type SeriesInput,
  type SeriesOutput
} from "@studio/shared";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import ffmpegStatic from "ffmpeg-static";
import { geminiGenerateVeoVideo } from "@studio/providers";

export const seriesAgent: Agent<SeriesInput, SeriesOutput> = {
  name: "series",
  inputSchema: SeriesInputSchema,
  outputSchema: SeriesOutputSchema,
  async run(ctx, input) {
    await ctx.log.log("series_start", "Series Agent started", { runIds: input.runIds.length });

    if (input.runIds.length === 1) {
      const final = await prisma.artifact.findFirst({
        where: { runId: input.runIds[0], kind: "final_video" },
        orderBy: { createdAt: "desc" }
      });
      if (!final) {
        throw new Error("Single-run series passthrough requires a final_video from the render stage.");
      }
      const signedUrl = await ctx.storage.signedUrl(final.gcsPath);
      await ctx.log.log("series_passthrough", "Reusing render final_video for single run", { artifactId: final.id });
      return {
        finalArtifactId: final.id,
        finalGcsPath: final.gcsPath,
        finalSignedUrl: signedUrl,
        totalDurationSeconds: 0,
        includedRunIds: input.runIds,
        passthrough: true
      };
    }

    const finals = await prisma.artifact.findMany({
      where: { runId: { in: input.runIds }, kind: "final_video" },
      orderBy: { createdAt: "asc" }
    });
    if (finals.length < 2) {
      throw new Error(`Series requires at least 2 final videos. Found ${finals.length}.`);
    }
    const dir = path.join(tmpdir(), `studio-series-${ctx.runId}-${nanoid(6)}`);
    await mkdir(dir, { recursive: true });
    try {
      const localPaths: string[] = [];
      const gemini = await ctx.providers.primary("GEMINI");
      if (gemini && input.introText) {
        const intro = await geminiGenerateVeoVideo(
          gemini,
          {
            sceneId: "series-intro",
            prompt: input.introText,
            aspectRatio: "16:9",
            durationBucket: "4"
          },
          {
            onUsage: async (event) => {
              await ctx.cost.record({ ...event, sceneId: "series-intro" });
            }
          }
        );
        if (intro.videoBytes) {
          const local = path.join(dir, `intro-${nanoid(6)}.mp4`);
          await writeFile(local, intro.videoBytes);
          localPaths.push(local);
          await ctx.artifacts.save({
            runId: ctx.runId,
            stage: "series",
            kind: "gemini_operation",
            body: JSON.stringify({ kind: "series_intro", operation: { ...intro, videoBytes: undefined } }, null, 2),
            mimeType: "application/json",
            filename: "series-intro-veo-operation.json",
            metadata: { operationName: intro.operationName, model: intro.model, sourceStage: "series" }
          });
        }
      }
      for (const a of finals) {
        const signed = await ctx.storage.signedUrl(a.gcsPath);
        const local = path.join(dir, `${a.id}.mp4`);
        const buf = await downloadToBuffer(signed);
        await writeFile(local, buf);
        localPaths.push(local);
      }
      if (gemini && input.outroText) {
        const outro = await geminiGenerateVeoVideo(
          gemini,
          {
            sceneId: "series-outro",
            prompt: input.outroText,
            aspectRatio: "16:9",
            durationBucket: "4"
          },
          {
            onUsage: async (event) => {
              await ctx.cost.record({ ...event, sceneId: "series-outro" });
            }
          }
        );
        if (outro.videoBytes) {
          const local = path.join(dir, `outro-${nanoid(6)}.mp4`);
          await writeFile(local, outro.videoBytes);
          localPaths.push(local);
          await ctx.artifacts.save({
            runId: ctx.runId,
            stage: "series",
            kind: "gemini_operation",
            body: JSON.stringify({ kind: "series_outro", operation: { ...outro, videoBytes: undefined } }, null, 2),
            mimeType: "application/json",
            filename: "series-outro-veo-operation.json",
            metadata: { operationName: outro.operationName, model: outro.model, sourceStage: "series" }
          });
        }
      }
      const finalLocal = path.join(dir, `series-${nanoid(8)}.mp4`);
      await concat(localPaths, finalLocal, dir);
      const buf = await readFile(finalLocal);
      const artifact = await ctx.artifacts.save({
        runId: ctx.runId,
        stage: "series",
        kind: "series_final_video",
        body: buf,
        mimeType: "video/mp4",
        filename: `series-${ctx.runId}.mp4`,
        metadata: { runIds: input.runIds }
      });
      const signedUrl = await ctx.storage.signedUrl(artifact.gcsPath);
      const totalDurationSeconds = 0; // ffprobe not bundled; left as 0 for MVP
      await ctx.log.log("series_done", "Series Agent finished", { artifact: artifact.id });
      return {
        finalArtifactId: artifact.id,
        finalGcsPath: artifact.gcsPath,
        finalSignedUrl: signedUrl,
        totalDurationSeconds,
        includedRunIds: input.runIds
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
};

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(new Uint8Array(ab));
}

async function concat(clipPaths: string[], outputPath: string, dir: string): Promise<void> {
  const listPath = path.join(dir, `concat-${nanoid(6)}.txt`);
  await writeFile(
    listPath,
    clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
    "utf8"
  );
  const bin = (ffmpegStatic as unknown as string) ?? "ffmpeg";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", "-y", outputPath], {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      code === 0 ? resolve() : reject(new Error(`ffmpeg series concat exited ${code}: ${stderr.slice(-600)}`));
    });
    child.on("error", (error) => reject(error));
  });
}
