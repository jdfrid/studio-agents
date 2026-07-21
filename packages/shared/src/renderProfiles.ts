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

/** Default from RENDER_PROFILE env, with GEMINI_VEO_MODE deprecated alias. */
export function defaultRenderProfileId(): RenderProfileId {
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
