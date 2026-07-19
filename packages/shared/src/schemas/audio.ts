import { z } from "zod";

export const AudioInputSchema = z.object({
  language: z.string(),
  scenes: z.array(
    z.object({
      sceneId: z.string(),
      narration: z.string(),
      durationSeconds: z.number().int().min(1),
      audioPolicy: z.string().optional()
    })
  ),
  musicPrompt: z.string()
});
export type AudioInput = z.infer<typeof AudioInputSchema>;

export const AudioOutputSchema = z.object({
  perScene: z.array(
    z.object({
      sceneId: z.string(),
      voiceArtifactId: z.string().nullable(),
      voiceGcsPath: z.string().nullable(),
      voiceDurationSeconds: z.number().nullable(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      voiceError: z.string().nullable().optional()
    })
  ),
  music: z.object({
    artifactId: z.string().nullable(),
    gcsPath: z.string().nullable(),
    durationSeconds: z.number().nullable(),
    prompt: z.string(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    requiresExternalMusic: z.boolean().default(false),
    unavailableReason: z.string().nullable().optional()
  })
});
export type AudioOutput = z.infer<typeof AudioOutputSchema>;
