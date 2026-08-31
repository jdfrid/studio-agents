import { z } from "zod";

/**
 * Customer-selectable subtitle styling. Every value maps to renderer-owned ASS
 * properties; arbitrary filter/style strings are deliberately not accepted.
 */
export const SubtitleStyleSchema = z
  .object({
    position: z.enum(["top", "middle", "bottom"]).optional(),
    size: z.enum(["small", "medium", "large"]).optional(),
    font: z.enum(["noto_sans", "noto_serif", "dejavu_sans"]).optional(),
    rotation: z.enum(["-8", "0", "8"]).optional(),
    effect: z.enum(["none", "outline", "shadow", "background"]).optional()
  })
  .strict();

export type SubtitleStyle = z.infer<typeof SubtitleStyleSchema>;

export const DEFAULT_SUBTITLE_STYLE = {
  position: "bottom",
  size: "medium",
  // Matches the pre-controls production renderer, which selected DejaVu first.
  font: "dejavu_sans",
  rotation: "0",
  effect: "outline"
} as const satisfies Required<SubtitleStyle>;

export function resolveSubtitleStyle(style?: SubtitleStyle | null): Required<SubtitleStyle> {
  return { ...DEFAULT_SUBTITLE_STYLE, ...(style ?? {}) };
}
