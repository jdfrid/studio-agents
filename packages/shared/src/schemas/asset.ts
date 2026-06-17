import { z } from "zod";

export const AssetInputSchema = z.object({
  aspectRatio: z.string(),
  scenes: z.array(
    z.object({
      sceneId: z.string(),
      visualPrompt: z.string(),
      veoPrompt: z.string().optional(),
      referenceImagePrompt: z.string().optional(),
      firstFramePrompt: z.string().optional(),
      lastFramePrompt: z.string().optional(),
      preferredKind: z.enum(["video", "image"]).default("video"),
      /** Optional brief-uploaded attachment path to use as the visual source. */
      uploadedAssetGcsPath: z.string().optional()
    })
  )
});
export type AssetInput = z.infer<typeof AssetInputSchema>;

export const AssetOutputSchema = z.object({
  perScene: z.array(
    z.object({
      sceneId: z.string(),
      kind: z.enum(["video", "image"]),
      sourceProvider: z.string(),
      sourceUrl: z.string().nullable(),
      artifactId: z.string(),
      gcsPath: z.string(),
      mimeType: z.string(),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
      geminiFileId: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      referenceFrame: z
        .object({
          artifactId: z.string(),
          gcsPath: z.string(),
          signedUrl: z.string().nullable(),
          prompt: z.string(),
          model: z.string()
        })
        .nullable()
        .optional(),
      firstFrame: z
        .object({
          artifactId: z.string(),
          gcsPath: z.string(),
          signedUrl: z.string().nullable(),
          prompt: z.string(),
          model: z.string()
        })
        .nullable()
        .optional(),
      lastFrame: z
        .object({
          artifactId: z.string(),
          gcsPath: z.string(),
          signedUrl: z.string().nullable(),
          prompt: z.string(),
          model: z.string()
        })
        .nullable()
        .optional()
    })
  )
});
export type AssetOutput = z.infer<typeof AssetOutputSchema>;
