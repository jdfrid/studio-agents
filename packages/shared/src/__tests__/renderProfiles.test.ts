import { describe, expect, it } from "vitest";
import {
  buildRenderProfileSnapshot,
  defaultRenderProfileId,
  getRenderProfile,
  heygenVideoPerSecondUsd,
  predictRenderProfileId,
  profileVideoPerSecondUsd,
  resolveRenderProfile,
  setPlatformDefaultRenderProfile,
  usesLipSyncVideoProvider
} from "../renderProfiles.js";

describe("resolveRenderProfile", () => {
  it("registers HeyGen Video as the ordinary default profile", () => {
    const prevProfile = process.env.RENDER_PROFILE;
    const prevVeo = process.env.GEMINI_VEO_MODE;
    delete process.env.RENDER_PROFILE;
    delete process.env.GEMINI_VEO_MODE;
    setPlatformDefaultRenderProfile(null);
    try {
      const profile = getRenderProfile("heygen-video");
      expect(profile.provider).toBe("heygen");
      expect(profile.capabilities.nativeAudio).toBe(true);
      expect(profile.capabilities.maxClipSeconds).toBe(15);
      expect(profileVideoPerSecondUsd(profile)).toBe(heygenVideoPerSecondUsd());
      expect(defaultRenderProfileId()).toBe("heygen-video");
      expect(usesLipSyncVideoProvider(profile)).toBe(false);
    } finally {
      if (prevProfile === undefined) delete process.env.RENDER_PROFILE;
      else process.env.RENDER_PROFILE = prevProfile;
      if (prevVeo === undefined) delete process.env.GEMINI_VEO_MODE;
      else process.env.GEMINI_VEO_MODE = prevVeo;
      setPlatformDefaultRenderProfile(null);
    }
  });

  it("keeps Omni as an explicit historical profile", () => {
    const profile = getRenderProfile("omni-multiclip");
    expect(profile.provider).toBe("omni");
    expect(profile.capabilities.referenceImage).toBe(true);
    expect(profileVideoPerSecondUsd(profile)).toBe(0.1);
  });

  it("uses brief.renderProfile when set", () => {
    const profile = resolveRenderProfile({ renderProfile: "veo-extend" });
    expect(profile.id).toBe("veo-extend");
    expect(profile.strategy).toBe("extend");
  });

  it("falls back to env default when brief omits profile", () => {
    const profile = resolveRenderProfile({});
    expect(profile.id).toBe(defaultRenderProfileId());
  });

  it("includes kling-i2v in registry", () => {
    const profile = getRenderProfile("kling-i2v");
    expect(profile.provider).toBe("kling");
    expect(profile.capabilities.referenceImage).toBe(true);
  });

  it("includes cheap fal i2v profiles", () => {
    expect(getRenderProfile("wan-i2v").provider).toBe("fal");
    expect(getRenderProfile("hailuo-i2v").provider).toBe("fal");
    expect(getRenderProfile("wan-i2v").capabilities.referenceImage).toBe(true);
  });

  it("includes Seedance and Luma Ray fal profiles", () => {
    expect(getRenderProfile("seedance-mini-i2v").falModel).toContain("seedance-2.0/mini");
    expect(getRenderProfile("seedance-fast-i2v").falModel).toContain("seedance-2.0/fast");
    expect(getRenderProfile("seedance-i2v").falModel).toBe("bytedance/seedance-2.0/image-to-video");
    expect(getRenderProfile("luma-ray-i2v").falModel).toContain("ray/v3.2");
    expect(getRenderProfile("luma-ray-i2v").capabilities.beatSeconds).toBe(5);
  });

  it("includes heygen-i2v lip-sync profile", () => {
    const profile = getRenderProfile("heygen-i2v");
    expect(profile.provider).toBe("heygen");
    expect(profile.capabilities.referenceImage).toBe(true);
    expect(profile.capabilities.nativeAudio).toBe(true);
    expect(usesLipSyncVideoProvider(profile)).toBe(true);
  });

  it("prices HeyGen Video at the October launch rate then the list rate", () => {
    expect(heygenVideoPerSecondUsd(new Date("2026-10-15T00:00:00.000Z"))).toBe(0.01);
    expect(heygenVideoPerSecondUsd(new Date("2026-11-01T00:00:00.000Z"))).toBe(0.02);
  });

  it("includes kling-avatar-i2v cheap lip-sync profile", () => {
    const profile = getRenderProfile("kling-avatar-i2v");
    expect(profile.provider).toBe("fal");
    expect(profile.falModel).toContain("ai-avatar");
    expect(profile.capabilities.nativeAudio).toBe(true);
    expect(profileVideoPerSecondUsd(profile)).toBeCloseTo(0.0562, 4);
  });

  it("prices Wan 2.7 at fal 720p list rate", () => {
    expect(profileVideoPerSecondUsd(getRenderProfile("wan-i2v"))).toBe(0.1);
  });
});

describe("predictRenderProfileId", () => {
  it("picks kling-avatar when lip-sync is on", () => {
    expect(predictRenderProfileId({ preferLipSync: true })).toBe("kling-avatar-i2v");
  });

  it("keeps the platform default when photos are present", () => {
    expect(predictRenderProfileId({ hasPhotoPlates: true })).toBe(defaultRenderProfileId());
  });

  it("preserves an explicitly selected historical Veo profile", () => {
    expect(predictRenderProfileId({ briefRenderProfile: "veo-multiclip" })).toBe("veo-multiclip");
  });
});

describe("buildRenderProfileSnapshot", () => {
  it("captures resolved profile for audit", () => {
    const snap = buildRenderProfileSnapshot({ renderProfile: "veo-multiclip" });
    expect(snap.profileId).toBe("veo-multiclip");
    expect(snap.resolvedAt).toBeTruthy();
  });
});
