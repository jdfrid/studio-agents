import { describe, expect, it } from "vitest";
import { BriefInputSchema, BriefOutputSchema, ScriptOutputSchema, SceneSpecSchema } from "../index.js";

describe("Brief schemas", () => {
  it("applies defaults", () => {
    const parsed = BriefInputSchema.parse({ title: "Test", sourceText: "Make a video" });
    expect(parsed.aspectRatio).toBe("9:16");
    expect(parsed.durationSeconds).toBe(30);
    expect(parsed.language).toBe("he");
  });
  it("rejects too short title", () => {
    expect(() => BriefInputSchema.parse({ title: "", sourceText: "x" })).toThrow();
  });
  it("brief output requires required fields", () => {
    expect(() => BriefOutputSchema.parse({})).toThrow();
  });
});

describe("Script schemas", () => {
  it("scene requires positive duration", () => {
    expect(() =>
      SceneSpecSchema.parse({
        id: "abc",
        order: 0,
        title: "T",
        narration: "N",
        visualPrompt: "V",
        veoPrompt: "Veo prompt",
        durationSeconds: 0
      })
    ).toThrow();
  });
  it("script output requires at least one scene", () => {
    expect(() =>
      ScriptOutputSchema.parse({
        scenes: [],
        totalDurationSeconds: 1,
        musicPrompt: "m",
        backgroundVisualPrompt: "b"
      })
    ).toThrow();
  });
});
