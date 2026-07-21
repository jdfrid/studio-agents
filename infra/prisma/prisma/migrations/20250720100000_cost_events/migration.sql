-- CreateEnum
CREATE TYPE "CostActivityType" AS ENUM ('veo_video', 'gemini_tts', 'gemini_image', 'gemini_text', 'gemini_music', 'gcs_upload', 'gcs_storage');

-- CreateEnum
CREATE TYPE "CostChargedStatus" AS ENUM ('yes', 'no', 'unknown');

-- CreateEnum
CREATE TYPE "CostBilledUnit" AS ENUM ('veo_seconds', 'image_call', 'text_call', 'tts_call', 'music_seconds', 'bytes');

-- CreateTable
CREATE TABLE "CostEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stageExecutionId" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "stage" "StageName" NOT NULL,
    "activityType" "CostActivityType" NOT NULL,
    "sceneId" TEXT,
    "model" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "billedUnits" DOUBLE PRECISION NOT NULL,
    "unit" "CostBilledUnit" NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "costNis" DOUBLE PRECISION NOT NULL,
    "charged" "CostChargedStatus" NOT NULL DEFAULT 'yes',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostEvent_runId_startedAt_idx" ON "CostEvent"("runId", "startedAt");

-- CreateIndex
CREATE INDEX "CostEvent_tenantId_startedAt_idx" ON "CostEvent"("tenantId", "startedAt");

-- AddForeignKey
ALTER TABLE "CostEvent" ADD CONSTRAINT "CostEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProjectRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
