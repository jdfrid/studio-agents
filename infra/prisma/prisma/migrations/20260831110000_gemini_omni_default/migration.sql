ALTER TABLE "PlatformSettings"
ALTER COLUMN "defaultRenderProfile" SET DEFAULT 'omni-multiclip';

-- Move installations still using the former ordinary default. The Veo profile
-- remains available for explicit selection after this migration.
UPDATE "PlatformSettings"
SET "defaultRenderProfile" = 'omni-multiclip'
WHERE "defaultRenderProfile" = 'veo-multiclip';
