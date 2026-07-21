import { describe, expect, it } from "vitest";
import {
  buildRenderProfileSnapshot,
  defaultRenderProfileId,
  getRenderProfile,
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
});

describe("buildRenderProfileSnapshot", () => {
  it("captures resolved profile for audit", () => {
    const snap = buildRenderProfileSnapshot({ renderProfile: "veo-multiclip" });
    expect(snap.profileId).toBe("veo-multiclip");
    expect(snap.resolvedAt).toBeTruthy();
  });
});
