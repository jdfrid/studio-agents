import { z } from "zod";

export const RequiredAssetKindSchema = z.enum(["voice", "music", "image", "video"]);
export type RequiredAssetKind = z.infer<typeof RequiredAssetKindSchema>;

export const VeoDurationBucketSchema = z.enum(["4", "6", "8"]);
export type VeoDurationBucket = z.infer<typeof VeoDurationBucketSchema>;

export const SceneAudioPolicySchema = z.enum([
  "gemini_tts_plus_music",
  "gemini_tts_only",
  "veo_native_audio",
  "muted"
]);
export type SceneAudioPolicy = z.infer<typeof SceneAudioPolicySchema>;

export const SceneSpecSchema = z.object({
  id: z.string(),
  order: z.number().int().min(0),
  title: z.string().min(1).max(120),
  narration: z.string().min(1).max(800),
  visualPrompt: z.string().min(1).max(1200),
  /** Short Veo prompt, intentionally concise because Veo input has tighter prompt limits than script models. */
  veoPrompt: z.string().min(1).max(1600),
  referenceImagePrompt: z.string().min(1).max(1600).optional(),
  firstFramePrompt: z.string().min(1).max(1600).optional(),
  lastFramePrompt: z.string().min(1).max(1600).optional(),
  durationBucket: VeoDurationBucketSchema.default("8"),
  audioPolicy: SceneAudioPolicySchema.default("gemini_tts_plus_music"),
  durationSeconds: z.number().int().min(1).max(60),
  requiredAssets: z.array(RequiredAssetKindSchema).default(["voice", "music", "video"])
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

export const ScriptInputSchema = z.object({
  brief: z.any() // BriefOutput — kept loose to avoid circular import; validated again by Brief schema
});
export type ScriptInput = z.infer<typeof ScriptInputSchema>;

export const ScriptOutputSchema = z.object({
  scenes: z.array(SceneSpecSchema).min(1).max(60),
  totalDurationSeconds: z.number().int().min(1),
  musicPrompt: z.string().min(1),
  backgroundVisualPrompt: z.string().min(1),
  geminiModel: z.string().optional()
});
export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;
