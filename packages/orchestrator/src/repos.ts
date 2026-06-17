import type {
  ArtifactKind,
  ArtifactRecord,
  ArtifactsRepository,
  ProviderCredentialView,
  ProvidersRepository,
  SaveArtifactInput,
  StageName
} from "@studio/shared";
import { decryptSecret, gcsClient } from "@studio/providers";
import { prisma } from "@studio/infra-prisma";
import { fromPrismaStage, toPrismaStage } from "./stageMap.js";

export function createArtifactsRepo(): ArtifactsRepository {
  const storage = gcsClient();
  return {
    async list(runId, stage) {
      const rows = await prisma.artifact.findMany({
        where: { runId, ...(stage ? { stage: toPrismaStage(stage) } : {}) },
        orderBy: { createdAt: "asc" }
      });
      return rows.map(rowToArtifact);
    },
    async save(input: SaveArtifactInput) {
      const body = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : Buffer.from(input.body);
      const dir = `runs/${input.runId}/${input.stage}`;
      const gcsPath = `${dir}/${Date.now()}-${sanitize(input.filename)}`;
      const { sizeBytes } = await storage.upload({ gcsPath, body, mimeType: input.mimeType });
      const row = await prisma.artifact.create({
        data: {
          runId: input.runId,
          stage: toPrismaStage(input.stage),
          kind: input.kind as ArtifactKind,
          gcsPath,
          mimeType: input.mimeType,
          sizeBytes,
          metadata: (input.metadata ?? {}) as object
        }
      });
      return rowToArtifact(row);
    },
    async signedUrl(artifactId) {
      const row = await prisma.artifact.findUniqueOrThrow({ where: { id: artifactId } });
      return storage.signedUrl(row.gcsPath);
    }
  };
}

export function createProvidersRepo(tenantId: string): ProvidersRepository {
  return {
    async listEnabled(type) {
      const rows = await prisma.providerCredential.findMany({
        where: { tenantId, type: type as any, enabled: true },
        orderBy: [{ priority: "asc" }, { id: "asc" }]
      });
      return rows.map(rowToProvider);
    },
    async primary(type) {
      const row = await prisma.providerCredential.findFirst({
        where: { tenantId, type: type as any, enabled: true },
        orderBy: [{ priority: "asc" }, { id: "asc" }]
      });
      return row ? rowToProvider(row) : null;
    }
  };
}

function rowToArtifact(row: {
  id: string;
  runId: string;
  stage: string;
  kind: string;
  gcsPath: string;
  mimeType: string;
  sizeBytes: number;
  metadata: unknown;
  createdAt: Date;
}): ArtifactRecord {
  return {
    id: row.id,
    runId: row.runId,
    stage: fromPrismaStage(row.stage as any) as StageName,
    kind: row.kind,
    gcsPath: row.gcsPath,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString()
  };
}

function rowToProvider(row: {
  id: string;
  type: string;
  provider: string;
  priority: number;
  config: unknown;
  encryptedKey: string | null;
}): ProviderCredentialView {
  return {
    id: row.id,
    type: row.type,
    provider: row.provider,
    priority: row.priority,
    config: (row.config as Record<string, unknown>) ?? {},
    secret: row.encryptedKey ? decryptSecret(row.encryptedKey) : undefined
  };
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}
