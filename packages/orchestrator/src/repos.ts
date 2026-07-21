import type {
  ArtifactKind,
  ArtifactRecord,
  ArtifactsRepository,
  CostRecorder,
  ProviderCredentialView,
  ProvidersRepository,
  SaveArtifactInput,
  StageName
} from "@studio/shared";
import { decryptSecret, gcsClient } from "@studio/providers";
import { prisma } from "@studio/infra-prisma";
import { fromPrismaStage, toPrismaStage } from "./stageMap.js";

export function createArtifactsRepo(cost?: CostRecorder): ArtifactsRepository {
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
      if (cost) {
        await cost.record({
          activityType: "gcs_upload",
          billedUnits: sizeBytes,
          unit: "bytes",
          charged: "yes",
          metadata: { kind: input.kind, filename: input.filename, gcsPath }
        });
        await cost.record({
          activityType: "gcs_storage",
          billedUnits: sizeBytes,
          unit: "bytes",
          charged: "yes",
          metadata: { kind: input.kind, filename: input.filename, gcsPath, prorated: "daily" }
        });
      }
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
      const fromDb = rows.map(rowToProvider);
      const env = envProvider(type);
      return env && !fromDb.some((p) => p.type === env.type) ? [...fromDb, env] : fromDb;
    },
    async primary(type) {
      const row = await prisma.providerCredential.findFirst({
        where: { tenantId, type: type as any, enabled: true },
        orderBy: [{ priority: "asc" }, { id: "asc" }]
      });
      if (row) return rowToProvider(row);
      return envProvider(type);
    }
  };
}

function envProvider(type: string): ProviderCredentialView | null {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  const geminiTypes = new Set(["GEMINI", "LLM", "TTS", "MUSIC", "MEDIA_SEARCH"]);
  if (key && geminiTypes.has(type)) {
    return {
      id: "env-gemini",
      type: type === "LLM" || type === "TTS" || type === "MUSIC" || type === "MEDIA_SEARCH" ? type : "GEMINI",
      provider: "google-gemini",
      priority: 0,
      config: {},
      secret: key
    };
  }

  if (type === "VIDEO") {
    const falKey = process.env.FAL_API_KEY;
    if (falKey) {
      return {
        id: "env-fal",
        type: "VIDEO",
        provider: "fal-kling",
        priority: 0,
        config: {},
        secret: falKey
      };
    }
  }

  return null;
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
