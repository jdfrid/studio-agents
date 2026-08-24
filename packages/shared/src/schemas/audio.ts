import { z } from "zod";

export const AudioInputSchema = z.object({
  language: z.string(),
  scenes: z.array(
    z.object({
      sceneId: z.string(),
      narration: z.string(),
      durationSeconds: z.number().int().min(1),
      audioPolicy: z.string().optional(),
      /** Override run-level voice for this scene (dialogue a/b). */
      voiceName: z.string().max(40).optional(),
      speaker: z.enum(["a", "b", "narrator"]).optional(),
      speakerName: z.string().max(80).optional()
    })
  ),
  musicPrompt: z.string(),
  /** When set, narrate with an ElevenLabs instant clone of this sample. */
  voiceCloneSample: z
    .object({
      name: z.string(),
      gcsPath: z.string(),
      mimeType: z.string()
    })
    .nullable()
    .optional(),
  /** Gemini TTS prebuilt voice (e.g. Charon / Kore). Ignored when voice clone is used. */
  voiceName: z.string().max(40).optional(),
  /** Secondary Gemini voice for speaker b (dialogue). */
  voiceNameB: z.string().max(40).optional(),
  /** Delivery style hint prepended to TTS text (speechStyle / accent / event tone). */
  voiceStyle: z.string().max(500).optional(),
  /** Optional brand end-card spoken line (business name / slogan / site). */
  brandEndNarration: z.string().max(400).optional()
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
  }),
  /** Spoken brand outro for the end card (mixed in render). */
  brandEnd: z
    .object({
      narration: z.string(),
      voiceArtifactId: z.string().nullable(),
      voiceGcsPath: z.string().nullable(),
      voiceDurationSeconds: z.number().nullable(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional()
    })
    .nullable()
    .optional()
});
export type AudioOutput = z.infer<typeof AudioOutputSchema>;
