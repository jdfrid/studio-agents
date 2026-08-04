import { prisma } from "@studio/infra-prisma";
import {
  PlatformSettingsPatchSchema,
  type PlatformSettingsPatch,
  type PlatformSettingsView,
  isRenderProfileId,
  setPlatformDefaultRenderProfile,
  type RenderProfileId
} from "@studio/shared";

const SETTINGS_ID = "platform";

let cache: PlatformSettingsView | null = null;

function envFreeVideos(): number {
  const n = Number(process.env.FREE_VIDEOS_PER_USER ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function envDefaultRenderProfile(): RenderProfileId {
  const fromEnv = process.env.RENDER_PROFILE?.trim();
  if (fromEnv && isRenderProfileId(fromEnv)) return fromEnv;
  const veoMode = process.env.GEMINI_VEO_MODE?.trim().toLowerCase();
  if (veoMode === "extend") return "veo-extend";
  return "veo-multiclip";
}

function rowToView(row: {
  defaultRenderProfile: string;
  geminiTextModel: string | null;
  geminiTtsModel: string | null;
  geminiImageModel: string | null;
  geminiMusicModel: string | null;
  geminiVideoModel: string | null;
  freeVideosPerUser: number;
  updatedAt: Date;
}): PlatformSettingsView {
  const profile = isRenderProfileId(row.defaultRenderProfile) ? row.defaultRenderProfile : envDefaultRenderProfile();
  return {
    defaultRenderProfile: profile,
    geminiTextModel: row.geminiTextModel,
    geminiTtsModel: row.geminiTtsModel,
    geminiImageModel: row.geminiImageModel,
    geminiMusicModel: row.geminiMusicModel,
    geminiVideoModel: row.geminiVideoModel,
    freeVideosPerUser: row.freeVideosPerUser,
    updatedAt: row.updatedAt.toISOString()
  };
}

async function ensureRow() {
  const existing = await prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.platformSettings.create({
    data: {
      id: SETTINGS_ID,
      defaultRenderProfile: envDefaultRenderProfile(),
      geminiTextModel: process.env.GEMINI_TEXT_MODEL?.trim() || null,
      geminiTtsModel: process.env.GEMINI_TTS_MODEL?.trim() || null,
      geminiImageModel: process.env.GEMINI_IMAGE_MODEL?.trim() || null,
      geminiMusicModel: process.env.GEMINI_MUSIC_MODEL?.trim() || null,
      geminiVideoModel: process.env.GEMINI_VIDEO_MODEL?.trim() || null,
      freeVideosPerUser: envFreeVideos()
    }
  });
}

export async function refreshPlatformSettingsCache(): Promise<PlatformSettingsView> {
  const row = await ensureRow();
  cache = rowToView(row);
  setPlatformDefaultRenderProfile(cache.defaultRenderProfile);
  return cache;
}

export function getPlatformSettingsSync(): PlatformSettingsView {
  if (cache) return cache;
  return {
    defaultRenderProfile: envDefaultRenderProfile(),
    geminiTextModel: process.env.GEMINI_TEXT_MODEL?.trim() || null,
    geminiTtsModel: process.env.GEMINI_TTS_MODEL?.trim() || null,
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL?.trim() || null,
    geminiMusicModel: process.env.GEMINI_MUSIC_MODEL?.trim() || null,
    geminiVideoModel: process.env.GEMINI_VIDEO_MODEL?.trim() || null,
    freeVideosPerUser: envFreeVideos(),
    updatedAt: new Date(0).toISOString()
  };
}

export async function getPlatformSettings(): Promise<PlatformSettingsView> {
  return refreshPlatformSettingsCache();
}

export async function updatePlatformSettings(patch: PlatformSettingsPatch): Promise<PlatformSettingsView> {
  const body = PlatformSettingsPatchSchema.parse(patch);
  await ensureRow();
  const row = await prisma.platformSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      ...body,
      geminiTextModel: body.geminiTextModel === undefined ? undefined : body.geminiTextModel,
      geminiTtsModel: body.geminiTtsModel === undefined ? undefined : body.geminiTtsModel,
      geminiImageModel: body.geminiImageModel === undefined ? undefined : body.geminiImageModel,
      geminiMusicModel: body.geminiMusicModel === undefined ? undefined : body.geminiMusicModel,
      geminiVideoModel: body.geminiVideoModel === undefined ? undefined : body.geminiVideoModel
    }
  });
  cache = rowToView(row);
  setPlatformDefaultRenderProfile(cache.defaultRenderProfile);
  return cache;
}

export async function getFreeVideosAllowance(): Promise<number> {
  const settings = await getPlatformSettings();
  return settings.freeVideosPerUser;
}

/** Effective free-video quota for a user (per-user override or platform default). */
export async function getFreeVideosAllowanceForUser(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeVideosLimit: true }
  });
  if (user?.freeVideosLimit != null) {
    return Math.max(0, user.freeVideosLimit);
  }
  return getFreeVideosAllowance();
}
