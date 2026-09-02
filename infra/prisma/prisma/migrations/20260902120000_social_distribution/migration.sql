-- CreateEnum
CREATE TYPE "SocialNetwork" AS ENUM ('TELEGRAM', 'YOUTUBE', 'FACEBOOK', 'INSTAGRAM', 'X', 'TIKTOK');
CREATE TYPE "SocialAuthKind" AS ENUM ('oauth2', 'bot_token', 'app_user');
CREATE TYPE "SocialConnectionStatus" AS ENUM ('active', 'expired', 'revoked', 'needs_reauth');
CREATE TYPE "SocialDestinationKind" AS ENUM ('channel', 'page', 'profile', 'group', 'bot_chat', 'playlist');
CREATE TYPE "SocialDestinationStatus" AS ENUM ('active', 'paused', 'archived');
CREATE TYPE "ContentPackageSource" AS ENUM ('run', 'api', 'manual');
CREATE TYPE "PublishMode" AS ENUM ('now', 'schedule', 'draft');
CREATE TYPE "PublishJobStatus" AS ENUM ('queued', 'transforming', 'uploading', 'processing', 'published', 'failed', 'cancelled', 'needs_review');

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "network" "SocialNetwork" NOT NULL,
    "authKind" "SocialAuthKind" NOT NULL,
    "encryptedTokens" TEXT,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "SocialConnectionStatus" NOT NULL DEFAULT 'active',
    "connectedByUserId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialDestination" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" "SocialDestinationKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "url" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "SocialDestinationStatus" NOT NULL DEFAULT 'active',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialDestination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" "ContentPackageSource" NOT NULL,
    "runId" TEXT,
    "artifactId" TEXT,
    "media" JSONB NOT NULL DEFAULT '[]',
    "copy" JSONB NOT NULL DEFAULT '{}',
    "coverGcsPath" TEXT,
    "scheduleAt" TIMESTAMP(3),
    "mode" "PublishMode" NOT NULL DEFAULT 'now',
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "status" "PublishJobStatus" NOT NULL DEFAULT 'queued',
    "nativePayload" JSONB NOT NULL DEFAULT '{}',
    "remotePostId" TEXT,
    "remoteUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "errorCode" TEXT,
    "adapterVersion" TEXT,
    "publishHandle" JSONB NOT NULL DEFAULT '{}',
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DistributeRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "destinationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributeRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialConnection_tenantId_network_externalUserId_key" ON "SocialConnection"("tenantId", "network", "externalUserId");
CREATE INDEX "SocialConnection_tenantId_network_status_idx" ON "SocialConnection"("tenantId", "network", "status");

CREATE UNIQUE INDEX "SocialDestination_connectionId_kind_externalId_key" ON "SocialDestination"("connectionId", "kind", "externalId");
CREATE INDEX "SocialDestination_tenantId_status_idx" ON "SocialDestination"("tenantId", "status");

CREATE INDEX "ContentPackage_tenantId_createdAt_idx" ON "ContentPackage"("tenantId", "createdAt");
CREATE INDEX "ContentPackage_runId_idx" ON "ContentPackage"("runId");

CREATE INDEX "PublishJob_tenantId_status_createdAt_idx" ON "PublishJob"("tenantId", "status", "createdAt");
CREATE INDEX "PublishJob_packageId_idx" ON "PublishJob"("packageId");
CREATE INDEX "PublishJob_destinationId_idx" ON "PublishJob"("destinationId");

CREATE UNIQUE INDEX "DistributeRule_tenantId_key" ON "DistributeRule"("tenantId");

ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialDestination" ADD CONSTRAINT "SocialDestination_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialDestination" ADD CONSTRAINT "SocialDestination_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentPackage" ADD CONSTRAINT "ContentPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPackage" ADD CONSTRAINT "ContentPackage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProjectRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentPackage" ADD CONSTRAINT "ContentPackage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ContentPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "SocialDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DistributeRule" ADD CONSTRAINT "DistributeRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
