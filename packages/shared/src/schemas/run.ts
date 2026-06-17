import { z } from "zod";
import { RunStatusSchema, StageNameSchema, StageStatusSchema } from "../enums.js";
import { BriefInputSchema } from "./brief.js";

export const CreateRunRequestSchema = z.object({
  tenantSlug: z.string().default("demo"),
  brief: BriefInputSchema
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

export const StageExecutionViewSchema = z.object({
  id: z.string(),
  stage: StageNameSchema,
  status: StageStatusSchema,
  attempts: z.number().int(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable()
});
export type StageExecutionView = z.infer<typeof StageExecutionViewSchema>;

export const ProjectRunViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  status: RunStatusSchema,
  currentStage: StageNameSchema.nullable(),
  brief: BriefInputSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  stages: z.array(StageExecutionViewSchema)
});
export type ProjectRunView = z.infer<typeof ProjectRunViewSchema>;

/** Per-stage policy for whether orchestrator should wait for human approval before continuing. */
export const STAGE_REQUIRES_APPROVAL: Record<string, boolean> = {
  brief: true,
  script: true,
  audio: false,
  asset: true,
  package: true,
  render: false,
  series: false
};
