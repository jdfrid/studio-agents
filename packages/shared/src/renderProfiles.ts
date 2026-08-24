import { z } from "zod";
export const RenderProfileIdSchema = z.enum([
  "veo-multiclip",
  "veo-extend",
  "kling-i2v",
  "kling-avatar-i2v",
  "wan-i2v",
  "hailuo-i2v",
  "heygen-i2v",
  "seedance-mini-i2v",
  "seedance-fast-i2v",
  "seedance-i2v",
  "luma-ray-i2v"
]);
export type RenderProfileId = z.infer<typeof RenderProfileIdSchema>;
export type VideoProviderName = "veo" | "kling" | "fal" | "heygen" | "runway" | "shotstack";
export type RenderStrategy = "multiclip" | "extend";
/** Target beat length for script/narration in extend / kling profiles. */
export const VEO_EXTEND_BEAT_SECONDS = 10;
/** HeyGen / Kling Avatar image→talking-head beat length (driven by narration audio). */
export const HEYGEN_BEAT_SECONDS = 8;
/** Kling AI Avatar v2 Standard — audio-driven lip-sync on fal. */
export const KLING_AVATAR_BEAT_SECONDS = 8;
/** Luma Ray 3.2 single-image i2v is capped at 5s (10s needs multi-keyframe). */
export const LUMA_RAY_BEAT_SECONDS = 5;
/** Seedance 2 beat length — short clips for volume / cost control. */
export const SEEDANCE_BEAT_SECONDS = 5;
export type RenderProfileCapabilities = {
  referenceImage: boolean;
  extend: boolean;
  nativeAudio: boolean;
  maxClipSeconds: number;
  beatSeconds: number;
};
export type RenderProfile = {
  id: RenderProfileId;
  label: string;
  labelHe: string;
  provider: VideoProviderName;
  strategy: RenderStrategy;
  /** fal.ai model path when provider is kling or fal */
  falModel?: string;
  /** Rough relative cost tier for UI filtering */
  costTier: "cheap" | "standard" | "premium";
  capabilities: RenderProfileCapabilities;
};
export const RENDER_PROFILES: Record<RenderProfileId, RenderProfile> = {
  "veo-multiclip": {
    id: "veo-multiclip",
    label: "Veo Fast — multiclip",
    labelHe: "Veo Fast — זול (ברירת מחדל)",
    provider: "veo",
    strategy: "multiclip",
    costTier: "cheap",
    capabilities: {
      referenceImage: false,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 8,
      beatSeconds: 4
    }
  },
  "veo-extend": {
    id: "veo-extend",
    label: "Veo Fast — extend chain",
    labelHe: "Veo Fast — שרשרת (יקר יותר)",
    provider: "veo",
    strategy: "extend",
    costTier: "premium",
    capabilities: {
      referenceImage: false,
      extend: true,
      nativeAudio: false,
      maxClipSeconds: 8,
      beatSeconds: VEO_EXTEND_BEAT_SECONDS
    }
  },
  "kling-i2v": {
    id: "kling-i2v",
    label: "Kling 2.1 — image-to-video",
    labelHe: "Kling 2.1 — מתמונה לווידאו",
    provider: "kling",
    strategy: "multiclip",
    falModel: "fal-ai/kling-video/v2.1/standard/image-to-video",
    costTier: "standard",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 10,
      beatSeconds: VEO_EXTEND_BEAT_SECONDS
    }
  },
  "kling-avatar-i2v": {
    id: "kling-avatar-i2v",
    label: "Kling Avatar v2 — lip-sync",
    labelHe: "Kling Avatar — סנכרון שפתיים (זול)",
    provider: "fal",
    strategy: "multiclip",
    falModel: "fal-ai/kling-video/ai-avatar/v2/standard",
    costTier: "cheap",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: true,
      maxClipSeconds: 15,
      beatSeconds: KLING_AVATAR_BEAT_SECONDS
    }
  },
  "wan-i2v": {
    id: "wan-i2v",
    label: "Wan 2.7 — image-to-video",
    labelHe: "Wan 2.7 — זול (מתמונה)",
    provider: "fal",
    strategy: "multiclip",
    falModel: "fal-ai/wan/v2.7/image-to-video",
    costTier: "cheap",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 5,
      beatSeconds: 5
    }
  },
  "hailuo-i2v": {
    id: "hailuo-i2v",
    label: "Hailuo MiniMax — image-to-video",
    labelHe: "Hailuo — זול (מתמונה)",
    provider: "fal",
    strategy: "multiclip",
    falModel: "fal-ai/minimax/hailuo-02/standard/image-to-video",
    costTier: "cheap",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 6,
      beatSeconds: 6
    }
  },
  "heygen-i2v": {
    id: "heygen-i2v",
    label: "HeyGen — image lip-sync",
    labelHe: "HeyGen — סנכרון שפתיים מתמונה",
    provider: "heygen",
    strategy: "multiclip",
    costTier: "standard",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: true,
      maxClipSeconds: 30,
      beatSeconds: HEYGEN_BEAT_SECONDS
    }
  },
  "seedance-mini-i2v": {
    id: "seedance-mini-i2v",
    label: "Seedance 2 Mini — image-to-video",
    labelHe: "Seedance 2 Mini — זול בכמויות",
    provider: "fal",
    strategy: "multiclip",
    falModel: "bytedance/seedance-2.0/mini/image-to-video",
    costTier: "cheap",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 15,
      beatSeconds: SEEDANCE_BEAT_SECONDS
    }
  },
  "seedance-fast-i2v": {
    id: "seedance-fast-i2v",
    label: "Seedance 2 Fast — image-to-video",
    labelHe: "Seedance 2 Fast — מהיר",
    provider: "fal",
    strategy: "multiclip",
    falModel: "bytedance/seedance-2.0/fast/image-to-video",
    costTier: "standard",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 15,
      beatSeconds: SEEDANCE_BEAT_SECONDS
    }
  },
  "seedance-i2v": {
    id: "seedance-i2v",
    label: "Seedance 2 — image-to-video",
    labelHe: "Seedance 2 — איכות מלאה",
    provider: "fal",
    strategy: "multiclip",
    falModel: "bytedance/seedance-2.0/image-to-video",
    costTier: "standard",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 15,
      beatSeconds: SEEDANCE_BEAT_SECONDS
    }
  },
  "luma-ray-i2v": {
    id: "luma-ray-i2v",
    label: "Luma Ray 3.2 — image-to-video",
    labelHe: "Luma Ray 3.2 — מתמונה לווידאו",
    provider: "fal",
    strategy: "multiclip",
    falModel: "luma/agent/ray/v3.2/image-to-video",
    costTier: "cheap",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 5,
      beatSeconds: LUMA_RAY_BEAT_SECONDS
    }
  }
};
export function listRenderProfiles(): RenderProfile[] {
  return Object.values(RENDER_PROFILES);
}
/** Profiles shown to end users — cheap / budget options only. */
export function listCheapRenderProfiles(): RenderProfile[] {
  return listRenderProfiles().filter(
    (p) =>
      p.costTier === "cheap" ||
      p.id === "kling-i2v" ||
      p.id === "kling-avatar-i2v" ||
      p.id === "heygen-i2v" ||
      p.id === "seedance-fast-i2v" ||
      p.id === "seedance-i2v"
  );
}

/**
 * Predict which render profile the brief agent will pick before the run starts.
 * Mirrors packages/agents/brief profile selection (lip-sync → photos → default).
 */
export function predictRenderProfileId(input: {
  preferLipSync?: boolean;
  hasPhotoPlates?: boolean;
  briefRenderProfile?: string | null;
  falAvailable?: boolean;
}): RenderProfileId {
  const falOk = input.falAvailable !== false;
  if (input.preferLipSync) {
    return falOk ? "kling-avatar-i2v" : "heygen-i2v";
  }
  if (input.hasPhotoPlates && falOk) return "wan-i2v";
  if (typeof input.briefRenderProfile === "string" && isRenderProfileId(input.briefRenderProfile)) {
    return input.briefRenderProfile;
  }
  return defaultRenderProfileId();
}
export function getRenderProfile(id: RenderProfileId): RenderProfile {
  return RENDER_PROFILES[id];
}
export function isRenderProfileId(value: string): value is RenderProfileId {
  return RenderProfileIdSchema.safeParse(value).success;
}
let platformDefaultRenderProfile: RenderProfileId | null = null;
export function setPlatformDefaultRenderProfile(id: RenderProfileId | null): void {
  platformDefaultRenderProfile = id;
}
/** Default from platform settings (set at runtime), then RENDER_PROFILE env. */
export function defaultRenderProfileId(): RenderProfileId {
  if (platformDefaultRenderProfile && isRenderProfileId(platformDefaultRenderProfile)) {
    return platformDefaultRenderProfile;
  }
  const fromEnv = process.env.RENDER_PROFILE?.trim();
  if (fromEnv && isRenderProfileId(fromEnv)) return fromEnv;
  const veoMode = process.env.GEMINI_VEO_MODE?.trim().toLowerCase();
  if (veoMode === "extend") return "veo-extend";
  return "veo-multiclip";
}
export function resolveRenderProfile(brief?: { renderProfile?: RenderProfileId | string | null } | null): RenderProfile {
  const requested = brief?.renderProfile;
  if (typeof requested === "string" && isRenderProfileId(requested)) {
    return getRenderProfile(requested);
  }
  return getRenderProfile(defaultRenderProfileId());
}
export function profileVeoMode(profile: RenderProfile): "extend" | "multiclip" {
  return profile.strategy === "extend" ? "extend" : "multiclip";
}
export function profileToProductionCostConfig(
  profile: RenderProfile,
  base?: Partial<import("./budget.js").ProductionCostConfig>
): Partial<import("./budget.js").ProductionCostConfig> {
  return {
    ...base,
    renderProfileId: profile.id,
    veoMode: profileVeoMode(profile)
  };
}
export type RenderProfileSnapshot = {
  profileId: RenderProfileId;
  label: string;
  provider: VideoProviderName;
  strategy: RenderStrategy;
  capabilities: RenderProfileCapabilities;
  resolvedAt: string;
  envDefault: RenderProfileId;
};
export function buildRenderProfileSnapshot(brief?: { renderProfile?: RenderProfileId | string | null } | null): RenderProfileSnapshot {
  const profile = resolveRenderProfile(brief);
  return {
    profileId: profile.id,
    label: profile.label,
    provider: profile.provider,
    strategy: profile.strategy,
    capabilities: profile.capabilities,
    resolvedAt: new Date().toISOString(),
    envDefault: defaultRenderProfileId()
  };
}
/** Rough USD per generated video second for cost estimates (720p-class, fal list prices). */
export function profileVideoPerSecondUsd(profile: RenderProfile, veoModelPerSecond = 0.08): number {
  if (profile.provider === "heygen") return 0.12;
  if (profile.id === "kling-avatar-i2v") return 0.0562;
  if (profile.provider === "kling") return 0.09;
  if (profile.provider === "fal") {
    // fal Wan 2.7: $0.10/s @ 720p (default API tier is 1080p @ $0.15 — we force 720p).
    if (profile.id === "wan-i2v") return 0.1;
    if (profile.id === "hailuo-i2v") return 0.045;
    // Seedance 2 (Runway-style credit rates → USD/sec at 720p).
    if (profile.id === "seedance-mini-i2v") return 0.16;
    if (profile.id === "seedance-fast-i2v") return 0.29;
    if (profile.id === "seedance-i2v") return 0.36;
    // Luma Ray 3.2: $0.30 / 5s @ 720p.
    if (profile.id === "luma-ray-i2v") return 0.06;
    return 0.05;
  }
  return veoModelPerSecond;
}
const KLING_VIDEO_MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";
const HEYGEN_VIDEO_MODEL = "heygen/v3/videos/image";
export function resolveRenderProfileId(id?: RenderProfileId | string | null): RenderProfileId {
  if (typeof id === "string" && isRenderProfileId(id)) return id;
  return defaultRenderProfileId();
}
/** UI label for the veoPrompt field (reused for Kling motion prompts). */
export function videoPromptLabel(profile: RenderProfile | RenderProfileId): string {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  if (p.provider === "kling" || p.provider === "fal" || p.provider === "heygen") return "Motion";
  return "Veo";
}
/** Short provider name for cost / approve buttons. */
export function videoProviderShortLabel(profile: RenderProfile | RenderProfileId): string {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  if (p.provider === "kling") return "Kling";
  if (p.provider === "heygen") return "HeyGen";
  if (p.provider === "fal") {
    if (p.id === "kling-avatar-i2v") return "Kling Avatar";
    if (p.id === "wan-i2v") return "Wan";
    if (p.id === "hailuo-i2v") return "Hailuo";
    if (p.id === "seedance-mini-i2v") return "Seedance Mini";
    if (p.id === "seedance-fast-i2v") return "Seedance Fast";
    if (p.id === "seedance-i2v") return "Seedance";
    if (p.id === "luma-ray-i2v") return "Luma Ray";
    return "fal";
  }
  if (p.strategy === "extend") return "Veo extend";
  return "Veo";
}
/** Model id shown in cost UI — Gemini video model or fal Kling endpoint. */
export function videoModelDisplay(profile: RenderProfile | RenderProfileId, geminiVideoModel?: string): string {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  if (p.falModel) return p.falModel;
  if (p.provider === "kling") return KLING_VIDEO_MODEL;
  if (p.provider === "heygen") return HEYGEN_VIDEO_MODEL;
  return geminiVideoModel ?? process.env.GEMINI_VIDEO_MODEL ?? "veo-3.1-fast-generate-preview";
}
export function budgetModeCheckboxLabel(profile: RenderProfile | RenderProfileId): string {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  const clip = p.capabilities.beatSeconds;
  if (p.provider === "kling" || p.provider === "fal" || p.provider === "heygen") {
    return `מצב חסכון (פחות סצנות, ${clip}s לסצנה, reference frame)`;
  }
  return `מצב חסכון (פחות סצנות, Veo ${clip}s, בלי first/last frames)`;
}
export function videoSecondsUnitLabel(profile: RenderProfile | RenderProfileId): string {
  return videoProviderShortLabel(profile);
}
export function usesFalVideoProvider(profile: RenderProfile | RenderProfileId): boolean {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  return p.provider === "kling" || p.provider === "fal";
}
export function usesHeygenVideoProvider(profile: RenderProfile | RenderProfileId): boolean {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  return p.provider === "heygen";
}
/** True lip-sync / talking-head (image + TTS audio) — HeyGen or fal Kling Avatar. */
export function usesLipSyncVideoProvider(profile: RenderProfile | RenderProfileId): boolean {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  return p.capabilities.nativeAudio === true;
}
/** Independent I2V-style profiles that plan scenes by beatSeconds (not Veo buckets). */
export function usesBeatLayoutProvider(profile: RenderProfile | RenderProfileId): boolean {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  return p.provider === "kling" || p.provider === "fal" || p.provider === "heygen";
}
