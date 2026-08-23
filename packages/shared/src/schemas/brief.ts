import { z } from "zod";
import { CreativeOptionsSchema } from "../creativeOptions.js";
import { AspectRatioSchema } from "../enums.js";
import { RenderProfileIdSchema } from "../renderProfiles.js";

export const BriefBrandingInputSchema = z
  .object({
    businessName: z.string().trim().max(120).optional(),
    slogan: z.string().trim().max(200).optional()
  })
  .strict();
export type BriefBrandingInput = z.infer<typeof BriefBrandingInputSchema>;

export const BriefBrandingOutputSchema = z
  .object({
    businessName: z.string().trim().max(120).optional(),
    slogan: z.string().trim().max(200).optional(),
    logo: z
      .object({
        name: z.string(),
        gcsPath: z.string(),
        mimeType: z.string()
      })
      .nullable()
      .optional(),
    /** Effective placement for end-card branding (always/open_and_end treated as end_only for now). */
    logoPlacement: z.enum(["none", "always", "end_only", "open_and_end"]).optional()
  })
  .strict();
export type BriefBrandingOutput = z.infer<typeof BriefBrandingOutputSchema>;

/** Free-form user input that kicks off a run. */
export const BriefInputSchema = z.object({
  title: z.string().min(2).max(200),
  sourceText: z.string().min(1).max(20_000),
  /** Do / don't creative instructions from the user (kept separate from the story description). */
  instructions: z.string().max(8_000).optional(),
  targetAudience: z.string().max(500).optional(),
  style: z.string().max(500).optional(),
  durationSeconds: z.number().int().min(5).max(180).default(30),
  aspectRatio: AspectRatioSchema.default("9:16"),
  language: z.string().min(2).max(10).default("he"),
  referenceLinks: z.array(z.string().url()).max(20).default([]),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        /** Either a GCS path uploaded prior, or a data URL for inline ingestion. */
        gcsPath: z.string().optional(),
        dataUrl: z.string().optional(),
        kind: z.enum(["image", "video", "audio", "text", "other"]).default("other"),
        /**
         * anchor = global cast/look reference;
         * scene = override one scene only;
         * voice_clone = narration voice sample;
         * insert_clip = short external video spliced into the final cut;
         * logo = business branding logo for end card / preview
         */
        role: z.enum(["anchor", "scene", "voice_clone", "insert_clip", "logo"]).default("anchor"),
        sceneIndex: z.number().int().min(0).optional(),
        /** Absolute second in the finished film where insert_clip begins (before end card). */
        insertAtSeconds: z.number().min(0).max(180).optional(),
        /** clip = keep original insert audio; narration = mute insert (keep studio voice around it). */
        audioSource: z.enum(["clip", "narration"]).optional()
      })
    )
    .max(20)
    .default([]),
  /** Fewer scenes, 4s Veo buckets, reference-only assets, TTS without Lyria. */
  budgetMode: z.boolean().default(false),
  /** Video render profile (provider + strategy). Falls back to RENDER_PROFILE env. */
  renderProfile: RenderProfileIdSchema.optional(),
  /** Pipeline approval: manual stops at each gate; auto runs all; auto_until_render pauses before render. */
  approvalMode: z.enum(["manual", "auto", "auto_until_render"]).default("auto"),
  /** Optional advanced creative controls from the user form. */
  creative: CreativeOptionsSchema.optional(),
  /** Optional business branding (name + slogan; logo via attachments role=logo). */
  branding: BriefBrandingInputSchema.optional()
});
export type BriefInput = z.infer<typeof BriefInputSchema>;

/** Structured requirements emitted by the Brief agent for downstream stages. */
export const BriefOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  targetAudience: z.string(),
  toneOfVoice: z.string(),
  style: z.string(),
  durationSeconds: z.number().int().min(5).max(180),
  aspectRatio: AspectRatioSchema,
  language: z.string(),
  /** Echo of user do/don't instructions for downstream stages. */
  instructions: z.string().max(8_000).optional(),
  brandConstraints: z.array(z.string()).default([]),
  visualDirection: z.string(),
  musicDirection: z.string(),
  callToAction: z.string().optional(),
  budgetMode: z.boolean().default(false),
  renderProfile: RenderProfileIdSchema,
  references: z
    .array(
      z.object({
        kind: z.enum(["link", "image", "video", "audio", "text", "other"]),
        ref: z.string(),
        note: z.string().optional()
      })
    )
    .default([]),
  /** User-uploaded look references (global anchor and optional per-scene overrides). */
  visualAnchors: z
    .array(
      z.object({
        name: z.string(),
        gcsPath: z.string(),
        mimeType: z.string(),
        role: z.enum(["anchor", "scene"]).default("anchor"),
        sceneId: z.string().optional()
      })
    )
    .default([]),
  /** Optional uploaded voice sample for ElevenLabs instant voice cloning. */
  voiceCloneSample: z
    .object({
      name: z.string(),
      gcsPath: z.string(),
      mimeType: z.string()
    })
    .nullable()
    .optional(),
  /** Optional short external clip spliced into the final film. */
  videoInsert: z
    .object({
      name: z.string(),
      gcsPath: z.string(),
      mimeType: z.string(),
      insertAtSeconds: z.number().min(0).max(180),
      audioSource: z.enum(["clip", "narration"])
    })
    .nullable()
    .optional(),
  /** Business branding for end card and UI preview. */
  branding: BriefBrandingOutputSchema.nullable().optional(),
  /** Gemini TTS prebuilt voice chosen from creative voice gender. */
  ttsVoiceName: z.string().max(40).nullable().optional(),
  /** Echo of user creative controls for package/render flags. */
  creative: CreativeOptionsSchema.optional()
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;
