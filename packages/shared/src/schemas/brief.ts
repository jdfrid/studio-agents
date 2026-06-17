import { z } from "zod";
import { AspectRatioSchema } from "../enums.js";

/** Free-form user input that kicks off a run. */
export const BriefInputSchema = z.object({
  title: z.string().min(2).max(200),
  sourceText: z.string().min(1).max(20_000),
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
        kind: z.enum(["image", "video", "audio", "text", "other"]).default("other")
      })
    )
    .max(20)
    .default([])
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
  brandConstraints: z.array(z.string()).default([]),
  visualDirection: z.string(),
  musicDirection: z.string(),
  callToAction: z.string().optional(),
  references: z
    .array(
      z.object({
        kind: z.enum(["link", "image", "video", "audio", "text", "other"]),
        ref: z.string(),
        note: z.string().optional()
      })
    )
    .default([])
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;
