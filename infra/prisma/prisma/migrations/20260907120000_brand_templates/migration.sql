-- CreateTable
CREATE TABLE "BrandTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "slogan" TEXT,
    "websiteUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "messages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mustSay" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mustAvoid" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "filmTemplate" TEXT,
    "durationSeconds" INTEGER,
    "platform" TEXT,
    "variationPolicy" JSONB NOT NULL DEFAULT '{}',
    "defaultCreative" JSONB NOT NULL DEFAULT '{}',
    "logoGcsPath" TEXT,
    "logoMimeType" TEXT,
    "logoName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BrandTemplate_tenantId_updatedAt_idx" ON "BrandTemplate"("tenantId", "updatedAt");

ALTER TABLE "BrandTemplate" ADD CONSTRAINT "BrandTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
