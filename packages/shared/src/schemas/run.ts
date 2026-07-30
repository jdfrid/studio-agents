import { z } from "zod";
import { RunStatusSchema, StageNameSchema, StageStatusSchema } from "../enums.js";
import { ApprovalModeSchema } from "./auth.js";
import { BriefInputSchema } from "./brief.js";

export const CreateRunRequestSchema = z.object({
  tenantSlug: z.string().optional(),
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
  userId: z.string().nullable().optional(),
  status: RunStatusSchema,
  currentStage: StageNameSchema.nullable(),
  brief: BriefInputSchema,
  approvalMode: ApprovalModeSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stages: z.array(StageExecutionViewSchema)
});
export type ProjectRunView = z.infer<typeof ProjectRunViewSchema>;

/** Per-stage policy when approvalMode is manual (or auto_until_render before render). */
export const STAGE_REQUIRES_APPROVAL: Record<string, boolean> = {
  brief: true,
  script: true,
  audio: false,
  asset: true,
  package: true,
  render: false,
  series: false
};

export function stageRequiresApproval(
  stage: string,
  approvalMode: "manual" | "auto" | "auto_until_render" = "manual"
): boolean {
  if (approvalMode === "auto") return false;
  if (approvalMode === "auto_until_render") {
    if (stage === "render" || stage === "series") return true;
    return false;
  }
  return STAGE_REQUIRES_APPROVAL[stage] === true;
}
