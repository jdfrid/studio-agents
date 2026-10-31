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
  /** Kept for stored platform settings; videos are always 30 seconds. */
  allowDurationOver30: z.boolean().default(false),
  updatedAt: z.string()
});
export type PlatformSettingsView = z.infer<typeof PlatformSettingsSchema>;

export const STANDARD_MAX_DURATION_SECONDS = 30;
export const EXTENDED_MAX_DURATION_SECONDS = 30;
export const STANDARD_DURATION_OPTIONS = [30] as const;
export const EXTENDED_DURATION_OPTIONS = [30] as const;

export function maxVideoDurationSeconds(_allowOver30?: boolean): number {
  return STANDARD_MAX_DURATION_SECONDS;
}

export function durationOptionsFor(_allowOver30?: boolean): readonly number[] {
  return STANDARD_DURATION_OPTIONS;
}

export function clampVideoDurationSeconds(_seconds?: number, _allowOver30?: boolean): number {
  return STANDARD_MAX_DURATION_SECONDS;
}

/** Lengths an operator can set when defining a growth task. The public studio form stays at 30 seconds. */
export const TASK_DURATION_OPTIONS = [30, 60, 120, 180, 300, 600] as const;
export const TASK_MAX_DURATION_SECONDS = 600;

export function taskDurationSeconds(value: unknown): (typeof TASK_DURATION_OPTIONS)[number] | null {
  const seconds = typeof value === "number" ? value : Number(value);
  return (TASK_DURATION_OPTIONS as readonly number[]).includes(seconds)
    ? (seconds as (typeof TASK_DURATION_OPTIONS)[number])
    : null;
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
