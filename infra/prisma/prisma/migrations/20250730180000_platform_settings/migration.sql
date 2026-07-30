CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "defaultRenderProfile" TEXT NOT NULL DEFAULT 'veo-multiclip',
    "geminiTextModel" TEXT,
    "geminiTtsModel" TEXT,
    "geminiImageModel" TEXT,
    "geminiMusicModel" TEXT,
    "geminiVideoModel" TEXT,
    "freeVideosPerUser" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSettings" ("id", "defaultRenderProfile", "freeVideosPerUser", "updatedAt")
VALUES ('platform', 'veo-multiclip', 0, CURRENT_TIMESTAMP);
