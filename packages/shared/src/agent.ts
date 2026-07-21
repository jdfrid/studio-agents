import type { z } from "zod";
import type { StageName } from "./enums.js";
import type { Logger } from "./logger.js";

export interface ArtifactsRepository {
  list(runId: string, stage?: StageName): Promise<ArtifactRecord[]>;
  save(input: SaveArtifactInput): Promise<ArtifactRecord>;
  signedUrl(artifactId: string): Promise<string>;
}

export interface ProvidersRepository {
  /** Returns enabled provider credentials for a type, sorted ascending by priority (lowest first). */
  listEnabled(type: string): Promise<ProviderCredentialView[]>;
  /** Returns the single best (lowest-priority) enabled provider for a type, or null. */
  primary(type: string): Promise<ProviderCredentialView | null>;
}

export interface ProviderCredentialView {
  id: string;
  type: string;
  provider: string;
  priority: number;
  config: Record<string, unknown>;
  /** Already-decrypted secret (orchestrator decrypts before passing). */
  secret?: string;
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  stage: StageName;
  kind: string;
  gcsPath: string;
  mimeType: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SaveArtifactInput {
  runId: string;
  stage: StageName;
  kind: string;
  body: Buffer | Uint8Array | string;
  mimeType: string;
  filename: string;
  metadata?: Record<string, unknown>;
}

export interface GcsClient {
  upload(input: { gcsPath: string; body: Buffer | Uint8Array | string; mimeType: string }): Promise<{ gcsPath: string; sizeBytes: number }>;
  download(gcsPath: string): Promise<{ body: Buffer; mimeType: string }>;
  signedUrl(gcsPath: string, ttlSeconds?: number): Promise<string>;
  bucket(): string;
}

export type CostUsageRecord = {
  activityType: import("./costLedger.js").CostActivityType;
  sceneId?: string | null;
  model?: string | null;
  startedAt?: Date;
  durationMs?: number | null;
  billedUnits: number;
  unit: import("./costLedger.js").CostBilledUnit;
  charged?: import("./costLedger.js").CostChargedStatus;
  metadata?: Record<string, unknown>;
  generateAudio?: boolean;
};

export interface CostRecorder {
  record(event: CostUsageRecord): Promise<void>;
}

export interface AgentContext {
  runId: string;
  tenantId: string;
  stage: StageName;
  stageExecutionId: string;
  attempt: number;
  artifacts: ArtifactsRepository;
  providers: ProvidersRepository;
  storage: GcsClient;
  log: Logger;
  cost: CostRecorder;
}

export interface Agent<I, O> {
  name: StageName;
  inputSchema: z.ZodType<I, z.ZodTypeDef, unknown>;
  outputSchema: z.ZodType<O, z.ZodTypeDef, unknown>;
  run(ctx: AgentContext, input: I): Promise<O>;
}
