ALTER TABLE "PlatformSettings"
ALTER COLUMN "defaultRenderProfile" SET DEFAULT 'heygen-video';

-- Move installations still using the former ordinary default. Explicit Omni /
-- Veo / fal profiles stay as selected.
UPDATE "PlatformSettings"
SET "defaultRenderProfile" = 'heygen-video'
WHERE "defaultRenderProfile" = 'omni-multiclip';
