-- Extra free video after a production fails before a finished file exists.
ALTER TABLE "User" ADD COLUMN "goodwillFreeVideos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProjectRun" ADD COLUMN "failureFreeVideoGranted" BOOLEAN NOT NULL DEFAULT false;
