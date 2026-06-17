import { z } from "zod";

export const SeriesInputSchema = z.object({
  runIds: z.array(z.string()).min(2).max(50),
  introText: z.string().optional(),
  outroText: z.string().optional(),
  transitionSeconds: z.number().min(0).max(3).default(0.5)
});
export type SeriesInput = z.infer<typeof SeriesInputSchema>;

export const SeriesOutputSchema = z.object({
  finalArtifactId: z.string(),
  finalGcsPath: z.string(),
  finalSignedUrl: z.string(),
  totalDurationSeconds: z.number(),
  includedRunIds: z.array(z.string())
});
export type SeriesOutput = z.infer<typeof SeriesOutputSchema>;
