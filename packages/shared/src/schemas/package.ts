import { z } from "zod";

export const PackageInputSchema = z.object({
  brief: z.any(),
  script: z.any(),
  audio: z.any(),
  asset: z.any()
});
export type PackageInput = z.infer<typeof PackageInputSchema>;

export const SceneTimelineEntrySchema = z.object({
  sceneId: z.string(),
  order: z.number().int(),
  startSecond: z.number(),
  endSecond: z.number(),
  durationSeconds: z.number(),
  title: z.string(),
  narration: z.string(),
  visualPrompt: z.string(),
  veoPrompt: z.string(),
  referenceImagePrompt: z.string().nullable().optional(),
  firstFramePrompt: z.string().nullable().optional(),
  lastFramePrompt: z.string().nullable().optional(),
  durationBucket: z.enum(["4", "6", "8"]),
  audioPolicy: z.enum(["gemini_tts_plus_music", "gemini_tts_only", "veo_native_audio", "muted"]),
  background: z.object({
    artifactId: z.string().nullable(),
    gcsPath: z.string().nullable(),
    signedUrl: z.string().nullable(),
    kind: z.enum(["video", "image"]).nullable()
  }),
  referenceFrame: z
    .object({
      artifactId: z.string().nullable(),
      gcsPath: z.string().nullable(),
      signedUrl: z.string().nullable(),
      prompt: z.string().nullable(),
      model: z.string().nullable()
    })
    .optional(),
  firstFrame: z
    .object({
      artifactId: z.string().nullable(),
      gcsPath: z.string().nullable(),
      signedUrl: z.string().nullable(),
      prompt: z.string().nullable(),
      model: z.string().nullable()
    })
    .optional(),
  lastFrame: z
    .object({
      artifactId: z.string().nullable(),
      gcsPath: z.string().nullable(),
      signedUrl: z.string().nullable(),
      prompt: z.string().nullable(),
      model: z.string().nullable()
    })
    .optional(),
  voice: z.object({
    artifactId: z.string().nullable(),
    gcsPath: z.string().nullable(),
    signedUrl: z.string().nullable()
  }),
  music: z.object({
    artifactId: z.string().nullable(),
    gcsPath: z.string().nullable(),
    signedUrl: z.string().nullable()
  })
});
export type SceneTimelineEntry = z.infer<typeof SceneTimelineEntrySchema>;

export const PackageOutputSchema = z.object({
  manifestArtifactId: z.string(),
  manifestGcsPath: z.string(),
  manifestSignedUrl: z.string(),
  instructionsArtifactId: z.string(),
  instructionsGcsPath: z.string(),
  timelineArtifactId: z.string(),
  timelineGcsPath: z.string(),
  geminiRenderPlanArtifactId: z.string(),
  geminiRenderPlanGcsPath: z.string(),
  timeline: z.array(SceneTimelineEntrySchema)
});
export type PackageOutput = z.infer<typeof PackageOutputSchema>;
