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
  /** When false, new videos are capped at 30 seconds. ADMIN can enable 45/60/custom. */
  allowDurationOver30: z.boolean().default(false),
  updatedAt: z.string()
});
export type PlatformSettingsView = z.infer<typeof PlatformSettingsSchema>;

export const STANDARD_MAX_DURATION_SECONDS = 30;
export const EXTENDED_MAX_DURATION_SECONDS = 180;
export const STANDARD_DURATION_OPTIONS = [15, 30] as const;
export const EXTENDED_DURATION_OPTIONS = [15, 30, 45, 60] as const;

export function maxVideoDurationSeconds(allowOver30?: boolean): number {
  return allowOver30 ? EXTENDED_MAX_DURATION_SECONDS : STANDARD_MAX_DURATION_SECONDS;
}

export function durationOptionsFor(allowOver30?: boolean): readonly number[] {
  return allowOver30 ? EXTENDED_DURATION_OPTIONS : STANDARD_DURATION_OPTIONS;
}

export function clampVideoDurationSeconds(seconds: number, allowOver30?: boolean): number {
  const max = maxVideoDurationSeconds(allowOver30);
  const n = Number.isFinite(seconds) ? Math.round(seconds) : STANDARD_MAX_DURATION_SECONDS;
  return Math.min(max, Math.max(5, n));
}

export const PlatformSettingsPatchSchema = z.object({
  defaultRenderProfile: RenderProfileIdSchema.optional(),
  geminiTextModel: z.string().trim().min(1).nullable().optional(),
  geminiTtsModel: z.string().trim().min(1).nullable().optional(),
  geminiImageModel: z.string().trim().min(1).nullable().optional(),
  geminiMusicModel: z.string().trim().min(1).nullable().optional(),
  geminiVideoModel: z.string().trim().min(1).nullable().optional(),
  freeVideosPerUser: z.number().int().min(0).max(100).optional(),
  allowDurationOver30: z.boolean().optional()
});
export type PlatformSettingsPatch = z.infer<typeof PlatformSettingsPatchSchema>;
