import {
  AssetOutputSchema,
  AudioOutputSchema,
  BriefOutputSchema,
  PackageOutputSchema,
  RenderOutputSchema,
  ScriptOutputSchema,
  SeriesOutputSchema,
  STAGE_ORDER,
  type StageName
} from "@studio/shared";
import type { z } from "zod";

const OUTPUT_SCHEMAS: Partial<Record<StageName, z.ZodTypeAny>> = {
  brief: BriefOutputSchema,
  script: ScriptOutputSchema,
  audio: AudioOutputSchema,
  asset: AssetOutputSchema,
  package: PackageOutputSchema,
  render: RenderOutputSchema,
  series: SeriesOutputSchema
};

export function parseStageOutput(stage: StageName, output: unknown): unknown {
  const schema = OUTPUT_SCHEMAS[stage];
  if (!schema) throw new Error(`Stage ${stage} output is not editable`);
  return schema.parse(output);
}

export function downstreamStages(from: StageName): StageName[] {
  const index = STAGE_ORDER.indexOf(from);
  if (index < 0) return [];
  return STAGE_ORDER.slice(index + 1);
}
