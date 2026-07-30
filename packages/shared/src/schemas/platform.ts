import { z } from "zod";
import { RenderProfileIdSchema } from "../renderProfiles.js";

export const PlatformSettingsSchema = z.object({
  defaultRenderProfile: RenderProfileIdSchema,
  geminiTextModel: z.string().nullable(),
  geminiTtsModel: z.string().nullable(),
  geminiImageModel: z.string().nullable(),
  geminiMusicModel: z.string().nullable(),
  geminiVideoModel: z.string().nullable(),
  freeVideosPerUser: z.number().int().min(0).max(100),
  updatedAt: z.string()
});
export type PlatformSettingsView = z.infer<typeof PlatformSettingsSchema>;

export const PlatformSettingsPatchSchema = z.object({
  defaultRenderProfile: RenderProfileIdSchema.optional(),
  geminiTextModel: z.string().trim().min(1).nullable().optional(),
  geminiTtsModel: z.string().trim().min(1).nullable().optional(),
  geminiImageModel: z.string().trim().min(1).nullable().optional(),
  geminiMusicModel: z.string().trim().min(1).nullable().optional(),
  geminiVideoModel: z.string().trim().min(1).nullable().optional(),
  freeVideosPerUser: z.number().int().min(0).max(100).optional()
});
export type PlatformSettingsPatch = z.infer<typeof PlatformSettingsPatchSchema>;
