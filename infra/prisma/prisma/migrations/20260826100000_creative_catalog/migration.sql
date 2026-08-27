CREATE TABLE "CreativeField" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreativeFieldTranslation" (
    "fieldId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sectionLabel" TEXT NOT NULL,
    "helpText" TEXT,
    "placeholder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeFieldTranslation_pkey" PRIMARY KEY ("fieldId", "locale")
);

CREATE TABLE "CreativeOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreativeOptionTranslation" (
    "optionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeOptionTranslation_pkey" PRIMARY KEY ("optionId", "locale")
);

CREATE UNIQUE INDEX "CreativeField_key_key" ON "CreativeField"("key");
CREATE INDEX "CreativeField_deletedAt_active_sortOrder_idx" ON "CreativeField"("deletedAt", "active", "sortOrder");
CREATE INDEX "CreativeField_sectionKey_sortOrder_idx" ON "CreativeField"("sectionKey", "sortOrder");
CREATE INDEX "CreativeFieldTranslation_locale_idx" ON "CreativeFieldTranslation"("locale");
CREATE UNIQUE INDEX "CreativeOption_fieldId_code_key" ON "CreativeOption"("fieldId", "code");
CREATE UNIQUE INDEX "CreativeOption_fieldId_value_key" ON "CreativeOption"("fieldId", "value");
CREATE INDEX "CreativeOption_fieldId_deletedAt_active_sortOrder_idx" ON "CreativeOption"("fieldId", "deletedAt", "active", "sortOrder");
CREATE INDEX "CreativeOptionTranslation_locale_idx" ON "CreativeOptionTranslation"("locale");

ALTER TABLE "CreativeFieldTranslation"
  ADD CONSTRAINT "CreativeFieldTranslation_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "CreativeField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeOption"
  ADD CONSTRAINT "CreativeOption_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "CreativeField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeOptionTranslation"
  ADD CONSTRAINT "CreativeOptionTranslation_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "CreativeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
