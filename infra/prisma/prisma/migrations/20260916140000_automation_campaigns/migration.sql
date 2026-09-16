-- CreateEnum
CREATE TYPE "AutomationCampaignStatus" AS ENUM ('idle', 'running', 'paused', 'needs_catalog');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('queued', 'scraping', 'producing', 'ready', 'failed');

-- AlterTable
ALTER TABLE "ProjectRun" ADD COLUMN "automationJobId" TEXT;

-- CreateTable
CREATE TABLE "AutomationCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandTemplateId" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "hourLocal" INTEGER NOT NULL DEFAULT 9,
    "lockedCreativeKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "AutomationCampaignStatus" NOT NULL DEFAULT 'needs_catalog',
    "distributeMode" TEXT NOT NULL DEFAULT 'hold',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationProduct" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priceText" TEXT,
    "description" TEXT,
    "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lastFetchedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "runId" TEXT,
    "dayKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationCampaign_tenantId_key" ON "AutomationCampaign"("tenantId");
CREATE INDEX "AutomationCampaign_enabled_hourLocal_idx" ON "AutomationCampaign"("enabled", "hourLocal");
CREATE INDEX "AutomationCampaign_userId_idx" ON "AutomationCampaign"("userId");

CREATE UNIQUE INDEX "AutomationProduct_campaignId_canonicalUrl_key" ON "AutomationProduct"("campaignId", "canonicalUrl");
CREATE INDEX "AutomationProduct_campaignId_usedAt_idx" ON "AutomationProduct"("campaignId", "usedAt");

CREATE UNIQUE INDEX "AutomationJob_campaignId_dayKey_key" ON "AutomationJob"("campaignId", "dayKey");
CREATE INDEX "AutomationJob_campaignId_createdAt_idx" ON "AutomationJob"("campaignId", "createdAt");
CREATE INDEX "AutomationJob_runId_idx" ON "AutomationJob"("runId");

CREATE UNIQUE INDEX "ProjectRun_automationJobId_key" ON "ProjectRun"("automationJobId");

ALTER TABLE "AutomationCampaign" ADD CONSTRAINT "AutomationCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationCampaign" ADD CONSTRAINT "AutomationCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationCampaign" ADD CONSTRAINT "AutomationCampaign_brandTemplateId_fkey" FOREIGN KEY ("brandTemplateId") REFERENCES "BrandTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationProduct" ADD CONSTRAINT "AutomationProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AutomationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AutomationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AutomationProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRun" ADD CONSTRAINT "ProjectRun_automationJobId_fkey" FOREIGN KEY ("automationJobId") REFERENCES "AutomationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
