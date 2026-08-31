import { describe, expect, it } from "vitest";
import {
  CREATIVE_FIELD_DEFS,
  activityTypeLabel,
  artifactKindLabel,
  creativeOptionLabel,
  formatCreativeConstraints,
  getCreativeFieldSections,
  normalizeCreativeOptionValue,
  pricingSourceLabel,
  renderProfileLabel,
  statusLabel,
  userFacingGeminiError
} from "../index.js";

describe("shared localization helpers", () => {
  it("keeps Hebrew defaults while supporting English", () => {
    expect(statusLabel("RUNNING")).toBe("רץ");
    expect(statusLabel("RUNNING", "en")).toBe("Running");
    expect(artifactKindLabel("final_video", "en")).toBe("Final video");
    expect(renderProfileLabel("omni-multiclip", "he")).toContain("ברירת מחדל");
    expect(renderProfileLabel("veo-multiclip", "en")).toContain("multiclip");
    expect(activityTypeLabel("gemini_image")).toBe("Gemini תמונה");
    expect(activityTypeLabel("gemini_image", undefined, "en")).toBe("Gemini image");
    expect(pricingSourceLabel("usage_metadata", "en")).toBe("Measured (tokens)");
  });

  it("provides English section, field, and option labels", () => {
    const sections = getCreativeFieldSections("en");
    expect(sections.find((section) => section.id === "envelope")?.title).toBe("Program setup");
    expect(
      sections.flatMap((section) => section.fields).find((field) => field.key === "targetAudience")?.label
    ).toBe("Target audience");
    expect(creativeOptionLabel("language", "עברית", "en")).toBe("Hebrew");
    expect(
      CREATIVE_FIELD_DEFS.flatMap((field) => field.options ?? []).every(
        (option) => option.code && option.labelEn && !/[\u0590-\u05ff]/.test(option.labelEn)
      )
    ).toBe(true);
  });

  it("normalizes stable option codes and legacy Hebrew values identically", () => {
    const option = CREATIVE_FIELD_DEFS.find((field) => field.key === "communicationStyle")?.options?.find(
      (candidate) => candidate.value === "שיחתי"
    );
    expect(option?.code).toBe("conversational_and_natural");
    expect(normalizeCreativeOptionValue("communicationStyle", option!.code!)).toBe("שיחתי");
    expect(normalizeCreativeOptionValue("communicationStyle", "שיחתי")).toBe("שיחתי");
  });

  it("formats creative constraints in the requested language", () => {
    const creative = { language: "hebrew", videoOrientation: "landscape", musicSync: "auto" } as const;
    expect(formatCreativeConstraints(creative, "en")).toEqual([
      "Language: Hebrew",
      "Video orientation: Landscape (16:9)",
      "Sync to scene pace: Automatic"
    ]);
    expect(formatCreativeConstraints(creative)[0]).toContain("שפה:");
  });

  it("returns localized friendly provider errors", () => {
    const raw = '402 {"error":{"message":"Payment required — insufficient credit balance"}}';
    expect(userFacingGeminiError(raw, 402, "en")).toContain("Prepay credits");
    expect(userFacingGeminiError(raw, 402)).toContain("נגמרו");
  });
});
