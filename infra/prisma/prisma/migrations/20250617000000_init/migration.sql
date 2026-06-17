-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('DRAFT', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StageName" AS ENUM ('brief', 'script', 'audio', 'asset', 'package_', 'render', 'series');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('GEMINI', 'LLM', 'TTS', 'MUSIC', 'MEDIA_SEARCH', 'VIDEO', 'STORAGE');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('brief_input', 'brief_output', 'script_output', 'voice_clip', 'music_track', 'scene_video_source', 'scene_image_source', 'scene_reference_frame', 'scene_first_frame', 'scene_last_frame', 'scene_rendered_clip', 'final_video', 'series_final_video', 'package_manifest', 'package_instructions', 'package_timeline', 'package_gemini_render_plan', 'gemini_operation');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStage" "StageName",
    "brief" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageExecution" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" "StageName" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" "StageName" NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "gcsPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "encryptedKey" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "finalGcsPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "ProjectRun_tenantId_status_idx" ON "ProjectRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StageExecution_status_idx" ON "StageExecution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StageExecution_runId_stage_key" ON "StageExecution"("runId", "stage");

-- CreateIndex
CREATE INDEX "Artifact_runId_stage_idx" ON "Artifact"("runId", "stage");

-- CreateIndex
CREATE INDEX "Artifact_runId_kind_idx" ON "Artifact"("runId", "kind");

-- CreateIndex
CREATE INDEX "ProviderCredential_tenantId_type_enabled_priority_idx" ON "ProviderCredential"("tenantId", "type", "enabled", "priority");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectRun" ADD CONSTRAINT "ProjectRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageExecution" ADD CONSTRAINT "StageExecution_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProjectRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProjectRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
