import type { ProjectRunView, StageName, StageStatus } from "@studio/shared";

export type RunSummary = {
  id: string;
  status: string;
  currentStage: string | null;
  title: string;
  updatedAt: string;
};

export type ArtifactRow = {
  id: string;
  runId: string;
  stage: StageName;
  kind: string;
  gcsPath: string;
  mimeType: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type GeminiCapabilityStatus = {
  apiKeyConfigured: boolean;
  text: { available: boolean; model: string; reason?: string };
  tts: { available: boolean; model: string; reason?: string };
  image: { available: boolean; model: string; reason?: string };
  music: { available: boolean; model: string; reason?: string };
  video: { available: boolean; model: string; reason?: string };
};

export type GeminiOperationRow = {
  id: string;
  stage: string;
  gcsPath: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type { ProjectRunView, StageName, StageStatus };
