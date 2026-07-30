import { describe, expect, it } from "vitest";
import { applyVisualCorrections, mergeCharacterBible } from "../visualCorrections.js";
import type { ScriptOutput } from "../schemas/script.js";

const baseScript = (): ScriptOutput => ({
  scenes: [
    {
      id: "s1",
      order: 0,
      title: "Slide",
      narration: "Hello",
      visualPrompt: "Man slides down water slide",
      veoPrompt: "Man slides down",
      referenceImagePrompt: "Man on slide",
      durationBucket: "8",
      audioPolicy: "gemini_tts_plus_music",
      durationSeconds: 8,
      requiredAssets: ["voice", "music", "video"]
    }
  ],
  totalDurationSeconds: 8,
  musicPrompt: "Upbeat",
  backgroundVisualPrompt: "Water park",
  characterBible: "Man, 30s, long hair blowing in wind"
});

describe("visualCorrections", () => {
  it("merges correction notes into character bible", () => {
    const merged = mergeCharacterBible("Man, 30s", "no bangs, baseball cap");
    expect(merged).toContain("no bangs");
    expect(merged).toContain("תיקונים ויזואליים");
  });

  it("applyVisualCorrections updates prompts and continuity", () => {
    const out = applyVisualCorrections(baseScript(), {
      corrections: "no bangs, wear baseball cap",
      characterBible: "Man, 30s, short hair, baseball cap"
    });
    expect(out.visualCorrections).toBe("no bangs, wear baseball cap");
    expect(out.characterBible).toContain("baseball cap");
    expect(out.scenes[0]!.referenceImagePrompt).toContain("baseball cap");
    expect(out.scenes[0]!.visualPrompt).toContain("Same cast & location");
  });

  it("applies per-scene visual overrides", () => {
    const out = applyVisualCorrections(baseScript(), {
      sceneOverrides: [{ sceneId: "s1", visualNotes: "Man slides with cap secured, hair tucked under cap" }]
    });
    expect(out.scenes[0]!.visualPrompt).toContain("cap secured");
  });
});
