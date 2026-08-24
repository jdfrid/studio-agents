import { describe, expect, it } from "vitest";
import {
  buildRenderProfileSnapshot,
  defaultRenderProfileId,
  getRenderProfile,
  predictRenderProfileId,
  profileVideoPerSecondUsd,
  resolveRenderProfile
} from "../renderProfiles.js";

describe("resolveRenderProfile", () => {
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

  it("picks wan when photos are present", () => {
    expect(predictRenderProfileId({ hasPhotoPlates: true })).toBe("wan-i2v");
  });
});

describe("buildRenderProfileSnapshot", () => {
  it("captures resolved profile for audit", () => {
    const snap = buildRenderProfileSnapshot({ renderProfile: "veo-multiclip" });
    expect(snap.profileId).toBe("veo-multiclip");
    expect(snap.resolvedAt).toBeTruthy();
  });
});
