-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "PlanType" AS ENUM ('PAYG', 'SUBSCRIPTION');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
CREATE TYPE "CreditReason" AS ENUM ('PURCHASE', 'SUBSCRIPTION_GRANT', 'RUN_RESERVE', 'RUN_COMPLETED', 'RUN_RELEASE', 'CORRECTION', 'REFUND', 'ADMIN_ADJUST');
CREATE TYPE "PaymentStatus" AS ENUM ('paid', 'refunded', 'pending');
CREATE TYPE "ApprovalMode" AS ENUM ('manual', 'auto', 'auto_until_render');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "tenantId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lemonSubscriptionId" TEXT NOT NULL,
    "planType" "PlanType" NOT NULL DEFAULT 'SUBSCRIPTION',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "creditsPerPeriod" INTEGER NOT NULL DEFAULT 30,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lemonOrderId" TEXT NOT NULL,
    "amountNis" DOUBLE PRECISION NOT NULL,
    "planType" "PlanType" NOT NULL,
    "creditsGranted" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'paid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProjectRun" ADD COLUMN "userId" TEXT;
ALTER TABLE "ProjectRun" ADD COLUMN "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'auto';
ALTER TABLE "ProjectRun" ADD COLUMN "isCorrectionRun" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectRun" ADD COLUMN "parentRunId" TEXT;
ALTER TABLE "ProjectRun" ADD COLUMN "creditReserved" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_tenantId_key" ON "User"("tenantId");
CREATE INDEX "User_email_idx" ON "User"("email");

CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Subscription_lemonSubscriptionId_key" ON "Subscription"("lemonSubscriptionId");

CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");
CREATE INDEX "CreditLedger_runId_idx" ON "CreditLedger"("runId");

CREATE UNIQUE INDEX "Payment_lemonOrderId_key" ON "Payment"("lemonOrderId");
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

CREATE INDEX "ProjectRun_userId_status_idx" ON "ProjectRun"("userId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProjectRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRun" ADD CONSTRAINT "ProjectRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectRun" ADD CONSTRAINT "ProjectRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "ProjectRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
