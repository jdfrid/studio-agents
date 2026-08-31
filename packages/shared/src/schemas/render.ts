import { z } from "zod";
import { SceneTimelineEntrySchema } from "./package.js";
import { RenderProfileIdSchema } from "../renderProfiles.js";
import { BriefBrandingOutputSchema } from "./brief.js";
import { SubtitleStyleSchema } from "./subtitleStyle.js";

export const VideoInsertSchema = z.object({
  name: z.string(),
  gcsPath: z.string(),
  mimeType: z.string(),
  insertAtSeconds: z.number().min(0).max(180),
  audioSource: z.enum(["clip", "narration"])
});
export type VideoInsert = z.infer<typeof VideoInsertSchema>;

export const RenderInputSchema = z.object({
  aspectRatio: z.string(),
  timeline: z.array(SceneTimelineEntrySchema),
  renderProfile: RenderProfileIdSchema,
  /** Optional short external clip spliced into the assembled film (before music/end card). */
  videoInsert: VideoInsertSchema.nullable().optional(),
  /** Optional business branding for the end card. */
  branding: BriefBrandingOutputSchema.nullable().optional(),
  /** Spoken brand outro from audio stage (GCS path). */
  brandEndVoice: z
    .object({
      gcsPath: z.string(),
      durationSeconds: z.number().nullable().optional(),
      narration: z.string().optional()
    })
    .nullable()
    .optional(),
  /** Content language for caption BiDi (he/ar RTL, en LTR). */
  language: z.string().optional(),
  /** Burn karaoke captions onto the assembled film. */
  karaokeCaptions: z.boolean().default(false),
  /** Bounded customer-facing subtitle appearance settings. Missing means legacy defaults. */
  subtitleStyle: SubtitleStyleSchema.optional(),
  /** Burn a vertical side watermark. */
  sideWatermark: z.boolean().default(false),
  /** Burn per-scene lower-third titles. */
  lowerThirds: z.boolean().default(false)
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
