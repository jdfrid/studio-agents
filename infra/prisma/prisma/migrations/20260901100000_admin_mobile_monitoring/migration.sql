CREATE TYPE "ProviderMetricType" AS ENUM ('BALANCE', 'QUOTA', 'BILLING_HEALTH', 'ESTIMATED_SPEND', 'SERVICE_HEALTH');
CREATE TYPE "ProviderAlertSeverity" AS ENUM ('WARNING', 'CRITICAL', 'RECOVERY');
CREATE TYPE "ProviderAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "MobileAuthCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "deviceId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobileRefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'android',
  "fcmToken" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderMonitor" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "metricType" "ProviderMetricType" NOT NULL,
  "unit" TEXT,
  "warningThreshold" DOUBLE PRECISION,
  "criticalThreshold" DOUBLE PRECISION,
  "lastValue" DOUBLE PRECISION,
  "lastCheckedAt" TIMESTAMP(3),
  "lastHealthyAt" TIMESTAMP(3),
  "source" TEXT NOT NULL,
  "sourceRealtime" BOOLEAN NOT NULL DEFAULT false,
  "billingUrl" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "estimatedRunwayHours" DOUBLE PRECISION,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderMonitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderSnapshot" (
  "id" TEXT NOT NULL,
  "monitorId" TEXT NOT NULL,
  "value" DOUBLE PRECISION,
  "healthy" BOOLEAN NOT NULL,
  "source" TEXT NOT NULL,
  "sourceRealtime" BOOLEAN NOT NULL DEFAULT false,
  "estimatedRunwayHours" DOUBLE PRECISION,
  "details" JSONB NOT NULL DEFAULT '{}',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderAlert" (
  "id" TEXT NOT NULL,
  "monitorId" TEXT NOT NULL,
  "severity" "ProviderAlertSeverity" NOT NULL,
  "status" "ProviderAlertStatus" NOT NULL DEFAULT 'OPEN',
  "fingerprint" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "recommendedAction" TEXT,
  "sourceEvent" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "pushSentAt" TIMESTAMP(3),
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "ProviderAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileAuthCode_codeHash_key" ON "MobileAuthCode"("codeHash");
CREATE INDEX "MobileAuthCode_expiresAt_idx" ON "MobileAuthCode"("expiresAt");
CREATE UNIQUE INDEX "MobileRefreshToken_tokenHash_key" ON "MobileRefreshToken"("tokenHash");
CREATE INDEX "MobileRefreshToken_userId_deviceId_idx" ON "MobileRefreshToken"("userId", "deviceId");
CREATE INDEX "MobileRefreshToken_familyId_idx" ON "MobileRefreshToken"("familyId");
CREATE INDEX "MobileRefreshToken_expiresAt_idx" ON "MobileRefreshToken"("expiresAt");
CREATE UNIQUE INDEX "AdminDevice_userId_deviceId_key" ON "AdminDevice"("userId", "deviceId");
CREATE INDEX "AdminDevice_fcmToken_idx" ON "AdminDevice"("fcmToken");
CREATE UNIQUE INDEX "ProviderMonitor_provider_key" ON "ProviderMonitor"("provider");
CREATE INDEX "ProviderMonitor_enabled_lastCheckedAt_idx" ON "ProviderMonitor"("enabled", "lastCheckedAt");
CREATE INDEX "ProviderSnapshot_monitorId_checkedAt_idx" ON "ProviderSnapshot"("monitorId", "checkedAt");
CREATE UNIQUE INDEX "ProviderAlert_fingerprint_key" ON "ProviderAlert"("fingerprint");
CREATE INDEX "ProviderAlert_status_severity_lastSeenAt_idx" ON "ProviderAlert"("status", "severity", "lastSeenAt");
CREATE INDEX "ProviderAlert_monitorId_lastSeenAt_idx" ON "ProviderAlert"("monitorId", "lastSeenAt");

ALTER TABLE "MobileAuthCode" ADD CONSTRAINT "MobileAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobileRefreshToken" ADD CONSTRAINT "MobileRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminDevice" ADD CONSTRAINT "AdminDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderSnapshot" ADD CONSTRAINT "ProviderSnapshot_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "ProviderMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderAlert" ADD CONSTRAINT "ProviderAlert_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "ProviderMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
