import { describe, expect, it } from "vitest";
import {
  applyContinuityToScript,
  FILM_STYLES,
  filmStylePromptClause,
  formatCreativeConstraints,
  resolveFilmStyle,
  type ScriptOutput
} from "../index.js";

describe("film style library", () => {
  it("resolves every catalog id and builds an English look lock", () => {
    expect(FILM_STYLES.length).toBeGreaterThanOrEqual(16);
    for (const style of FILM_STYLES) {
      expect(resolveFilmStyle(style.id)?.labelEn).toBe(style.labelEn);
    }
    const lock = filmStylePromptClause("watercolor");
    expect(lock).toContain("LOOK:");
    expect(lock).toContain("watercolor");
    expect(lock).toContain("Camera:");
    expect(lock).toContain("Native move:");
    expect(filmStylePromptClause("unknown")).toBe("");
  });

  it("formats film-style constraints with the model prompt", () => {
    const lines = formatCreativeConstraints({ filmStyle: "swiss-motion" }, "en");
    expect(lines.some((line) => line.includes("Swiss motion graphics"))).toBe(true);
    expect(lines.some((line) => line.includes("modular grid"))).toBe(true);
    expect(lines.some((line) => line.includes("Camera grammar"))).toBe(true);
  });

  it("injects the look lock into continuity prefixes", () => {
    const script: ScriptOutput = {
      scenes: [
        {
          id: "s1",
          order: 0,
          title: "Open",
          narration: "Hello",
          visualPrompt: "Woman opens a shop door",
          veoPrompt: "She steps inside",
          referenceImagePrompt: "Woman opens a shop door",
          durationBucket: "8",
          audioPolicy: "gemini_tts_plus_music",
          durationSeconds: 8,
          requiredAssets: ["voice", "music", "video"],
          sceneKind: "beat"
        }
      ],
      totalDurationSeconds: 8,
      musicPrompt: "",
      backgroundVisualPrompt: "A bakery on a sunny street",
      characterBible: "A woman in a blue coat"
    };
    const next = applyContinuityToScript(script, null, {
      styleLock: filmStylePromptClause("watercolor")
    });
    const scene = next.scenes[0];
    expect(scene?.visualPrompt).toContain("LOOK:");
    expect(scene?.veoPrompt).toContain("watercolor");
    expect(scene?.referenceImagePrompt).toContain("LOOK:");
  });
});
