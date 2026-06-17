import { z } from "zod";
import { StageNameSchema } from "../enums.js";

export const ArtifactKindSchema = z.enum([
  "brief_input",
  "brief_output",
  "script_output",
  "voice_clip",
  "music_track",
  "scene_video_source",
  "scene_image_source",
  "scene_reference_frame",
  "scene_first_frame",
  "scene_last_frame",
  "scene_rendered_clip",
  "final_video",
  "series_final_video",
  "package_manifest",
  "package_instructions",
  "package_timeline",
  "package_gemini_render_plan",
  "gemini_operation"
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stage: StageNameSchema,
  kind: ArtifactKindSchema,
  gcsPath: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().min(0),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string()
});
export type ArtifactRecordView = z.infer<typeof ArtifactRecordSchema>;
