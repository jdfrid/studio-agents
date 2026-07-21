import { describe, expect, it } from "vitest";
import {
  estimateRunCost,
  isProductAdBrief,
  planSceneLayout,
  veoGenerateAudio,
  veoModelTier,
  veoSupportsNativeAudio
} from "../budget.js";

describe("planSceneLayout", () => {
  it("aligns 30s budget brief with 4s Veo bucket (popcorn ad fix)", () => {
    const layout = planSceneLayout(30, true, { forcedVeoBucket: "4" });
    expect(layout.sceneCount).toBe(8);
    expect(layout.clipSeconds).toBe(4);
    expect(layout.totalVideoSeconds).toBe(32);
    // Old bug: TARGET_SCENE_SECONDS=10 → 3 scenes × 4s = 12s total
    expect(layout.totalVideoSeconds).not.toBe(12);
  });
});

describe("isProductAdBrief", () => {
  it("detects Hebrew product-ad briefs", () => {
    expect(isProductAdBrief({ title: "פרסומת פופקומן", sourceText: "ילדים בגן" })).toBe(true);
    expect(isProductAdBrief({ title: "Documentary", sourceText: "nature film" })).toBe(false);
  });
});

describe("estimateRunCost", () => {
  it("flags Standard Veo as expensive (~50 NIS for 30s normal)", () => {
    const est = estimateRunCost(
      { budgetMode: false, durationSeconds: 30 },
      { videoModel: "veo-3.1-generate-preview", veoGenerateAudio: true, usdToIls: 3.6 }
    );
    expect(est.veoTier).toBe("standard");
    expect(est.isExpensive).toBe(true);
    expect(est.nis).toBeGreaterThan(40);
    expect(est.warning).toContain("Standard");
  });

  it("estimates budget lite run with bucket-aligned scene count", () => {
    const est = estimateRunCost(
      { budgetMode: true, durationSeconds: 30 },
      {
        videoModel: "veo-3.1-lite-generate-preview",
        veoGenerateAudio: false,
        usdToIls: 3.6,
        forcedVeoBucket: "4"
      }
    );
    expect(est.sceneCount).toBe(8);
    expect(est.veoSeconds).toBe(32);
    expect(est.isExpensive).toBe(false);
  });

  it("uses actual script scenes when provided", () => {
    const est = estimateRunCost(
      { budgetMode: true, durationSeconds: 30, scenes: [{ durationBucket: "4" }, { durationBucket: "4" }, { durationBucket: "4" }] },
      { videoModel: "veo-3.1-fast-generate-preview", veoGenerateAudio: false, usdToIls: 3.6 }
    );
    expect(est.sceneCount).toBe(3);
    expect(est.veoSeconds).toBe(12);
  });
});
describe("veoModelTier", () => {
  it("detects tiers", () => {
    expect(veoModelTier("veo-3.1-lite-generate-preview")).toBe("lite");
    expect(veoModelTier("veo-3.1-fast-generate-preview")).toBe("fast");
    expect(veoModelTier("veo-3.1-generate-preview")).toBe("standard");
  });
});

describe("veoSupportsNativeAudio", () => {
  it("only standard models accept generateAudio API param", () => {
    expect(veoSupportsNativeAudio("veo-3.1-generate-preview")).toBe(true);
    expect(veoSupportsNativeAudio("veo-3.1-fast-generate-preview")).toBe(false);
    expect(veoSupportsNativeAudio("veo-3.1-lite-generate-preview")).toBe(false);
  });
});

describe("veoGenerateAudio", () => {
  it("defaults to off unless GEMINI_VEO_AUDIO=1", () => {
    const prev = process.env.GEMINI_VEO_AUDIO;
    delete process.env.GEMINI_VEO_AUDIO;
    expect(veoGenerateAudio()).toBe(false);
    process.env.GEMINI_VEO_AUDIO = "1";
    expect(veoGenerateAudio()).toBe(true);
    if (prev === undefined) delete process.env.GEMINI_VEO_AUDIO;
    else process.env.GEMINI_VEO_AUDIO = prev;
  });
});
