-- AlterEnum
CREATE TYPE "PlanType_new" AS ENUM ('PAYG', 'SUBSCRIPTION', 'STARTER', 'BUSINESS');
ALTER TABLE "Subscription" ALTER COLUMN "planType" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "planType" TYPE "PlanType_new" USING ("planType"::text::"PlanType_new");
ALTER TABLE "Payment" ALTER COLUMN "planType" TYPE "PlanType_new" USING ("planType"::text::"PlanType_new");
ALTER TYPE "PlanType" RENAME TO "PlanType_old";
ALTER TYPE "PlanType_new" RENAME TO "PlanType";
DROP TYPE "PlanType_old";
ALTER TABLE "Subscription" ALTER COLUMN "planType" SET DEFAULT 'SUBSCRIPTION';

ALTER TABLE "Subscription" ALTER COLUMN "creditsPerPeriod" SET DEFAULT 200;

-- Scale leftover 1-credit-per-video balances to 40 credits per video.
INSERT INTO "CreditLedger" (id, "userId", delta, reason, "balanceAfter", metadata, "createdAt")
SELECT
  'cscale_' || latest."userId",
  latest."userId",
  round((latest."balanceAfter" * 39)::numeric, 3),
  'ADMIN_ADJUST',
  round((latest."balanceAfter" * 40)::numeric, 3),
  '{"scaleFromLegacy":"40"}'::jsonb,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("userId") "userId", "balanceAfter"
  FROM "CreditLedger"
  ORDER BY "userId", "createdAt" DESC, id DESC
) latest
WHERE ABS(latest."balanceAfter") > 0.0001
  AND NOT EXISTS (
    SELECT 1 FROM "CreditLedger" existing
    WHERE existing.id = 'cscale_' || latest."userId"
  );

UPDATE "ProjectRun"
SET "creditReserved" = "creditReserved" * 40
WHERE "creditReserved" > 0 AND "creditReserved" < 40;

UPDATE "Subscription"
SET "creditsPerPeriod" = "creditsPerPeriod" * 40
WHERE "planType" = 'SUBSCRIPTION' AND "creditsPerPeriod" <= 30;
