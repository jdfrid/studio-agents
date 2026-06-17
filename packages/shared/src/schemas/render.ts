import { z } from "zod";
import { SceneTimelineEntrySchema } from "./package.js";

export const RenderInputSchema = z.object({
  aspectRatio: z.string(),
  timeline: z.array(SceneTimelineEntrySchema)
});
export type RenderInput = z.infer<typeof RenderInputSchema>;

export const RenderSceneResultSchema = z.object({
  sceneId: z.string(),
  artifactId: z.string(),
  gcsPath: z.string(),
  durationSeconds: z.number(),
  provider: z.string(),
  model: z.string().optional(),
  geminiOperationName: z.string().nullable().optional(),
  promptHash: z.string().nullable().optional()
});
export type RenderSceneResult = z.infer<typeof RenderSceneResultSchema>;

export const RenderOutputSchema = z.object({
  provider: z.string(),
  perScene: z.array(RenderSceneResultSchema),
  finalArtifactId: z.string(),
  finalGcsPath: z.string(),
  finalSignedUrl: z.string(),
  totalDurationSeconds: z.number(),
  geminiOperations: z
    .array(
      z.object({
        sceneId: z.string(),
        operationName: z.string(),
        status: z.enum(["queued", "polling", "completed", "failed"]),
        model: z.string(),
        error: z.string().nullable().optional()
      })
    )
    .default([])
});
export type RenderOutput = z.infer<typeof RenderOutputSchema>;
