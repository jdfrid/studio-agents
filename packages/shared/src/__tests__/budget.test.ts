import { describe, expect, it } from "vitest";
import { estimateRunCost, veoGenerateAudio, veoModelTier } from "../budget.js";

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

  it("estimates budget lite run as cheap", () => {
    const est = estimateRunCost(
      { budgetMode: true, durationSeconds: 30 },
      { videoModel: "veo-3.1-lite-generate-preview", veoGenerateAudio: false, usdToIls: 3.6 }
    );
    expect(est.veoSeconds).toBe(12);
    expect(est.isExpensive).toBe(false);
    expect(est.nis).toBeLessThan(5);
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
