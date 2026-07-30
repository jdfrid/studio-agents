import { z } from "zod";

export const RenderProfileIdSchema = z.enum(["veo-multiclip", "veo-extend", "kling-i2v"]);
export type RenderProfileId = z.infer<typeof RenderProfileIdSchema>;

export type VideoProviderName = "veo" | "kling" | "runway" | "shotstack";

export type RenderStrategy = "multiclip" | "extend";

/** Target beat length for script/narration in extend / kling profiles. */
export const VEO_EXTEND_BEAT_SECONDS = 10;

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
  provider: VideoProviderName;
  strategy: RenderStrategy;
  capabilities: RenderProfileCapabilities;
};

export const RENDER_PROFILES: Record<RenderProfileId, RenderProfile> = {
  "veo-multiclip": {
    id: "veo-multiclip",
    label: "Veo Fast — multiclip",
    provider: "veo",
    strategy: "multiclip",
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
    provider: "veo",
    strategy: "extend",
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
    provider: "kling",
    strategy: "multiclip",
    capabilities: {
      referenceImage: true,
      extend: false,
      nativeAudio: false,
      maxClipSeconds: 10,
      beatSeconds: VEO_EXTEND_BEAT_SECONDS
    }
  }
};

export function listRenderProfiles(): RenderProfile[] {
  return Object.values(RENDER_PROFILES);
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

/** Rough USD per generated video second for cost estimates. */
export function profileVideoPerSecondUsd(profile: RenderProfile, veoModelPerSecond = 0.08): number {
  if (profile.provider === "kling") return 0.09;
  return veoModelPerSecond;
}

const KLING_VIDEO_MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";

export function resolveRenderProfileId(id?: RenderProfileId | string | null): RenderProfileId {
  if (typeof id === "string" && isRenderProfileId(id)) return id;
  return defaultRenderProfileId();
}

/** UI label for the veoPrompt field (reused for Kling motion prompts). */
export function videoPromptLabel(profile: RenderProfile | RenderProfileId): string {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  return p.provider === "kling" ? "Kling motion" : "Veo";
}

/** Short provider name for cost / approve buttons. */
export function videoProviderShortLabel(profile: RenderProfile | RenderProfileId): string {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  if (p.provider === "kling") return "Kling";
  if (p.strategy === "extend") return "Veo extend";
  return "Veo";
}

/** Model id shown in cost UI — Gemini video model or fal Kling endpoint. */
export function videoModelDisplay(profile: RenderProfile | RenderProfileId, geminiVideoModel?: string): string {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  if (p.provider === "kling") return KLING_VIDEO_MODEL;
  return geminiVideoModel ?? process.env.GEMINI_VIDEO_MODEL ?? "veo-3.1-fast-generate-preview";
}

export function budgetModeCheckboxLabel(profile: RenderProfile | RenderProfileId): string {
  const p = typeof profile === "string" ? getRenderProfile(profile) : profile;
  const clip = p.capabilities.beatSeconds;
  if (p.provider === "kling") {
    return `מצב חסכון (פחות סצנות, ${clip}s לסצנה, reference frame)`;
  }
  return `מצב חסכון (פחות סצנות, Veo ${clip}s, בלי first/last frames)`;
}

export function videoSecondsUnitLabel(profile: RenderProfile | RenderProfileId): string {
  return videoProviderShortLabel(profile);
}
