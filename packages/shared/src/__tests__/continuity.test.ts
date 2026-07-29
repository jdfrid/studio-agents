import { describe, expect, it } from "vitest";
import {
  applyContinuityToScript,
  buildReferenceImagePrompt,
  deriveCharacterBible,
  type ScriptOutput
} from "../index.js";

const baseScript = (): ScriptOutput => ({
  scenes: [
    {
      id: "s1",
      order: 0,
      title: "Open",
      narration: "Hello",
      visualPrompt: "Woman opens car door",
      veoPrompt: "Camera pans as she opens door",
      referenceImagePrompt: "Woman opens car door",
      durationBucket: "8",
      audioPolicy: "gemini_tts_plus_music",
      durationSeconds: 8,
      requiredAssets: ["voice", "music", "video"]
    },
    {
      id: "s2",
      order: 1,
      title: "Drive",
      narration: "Go",
      visualPrompt: "Same woman drives",
      veoPrompt: "She drives along coast",
      referenceImagePrompt: "Woman driving",
      durationBucket: "8",
      audioPolicy: "gemini_tts_plus_music",
      durationSeconds: 8,
      requiredAssets: ["voice", "music", "video"]
    }
  ],
  totalDurationSeconds: 16,
  musicPrompt: "Upbeat",
  backgroundVisualPrompt: "Coastal highway at golden hour",
  characterBible: "Woman, 30s, auburn hair, beige coat"
});

describe("continuity", () => {
  it("derives character bible from background when missing", () => {
    const bible = deriveCharacterBible("Mountain overlook sunset", null);
    expect(bible).toContain("Mountain overlook sunset");
  });

  it("locks cast in every reference image prompt", () => {
    const prompt = buildReferenceImagePrompt({
      characterBible: "Man, 40s, navy jacket",
      backgroundVisualPrompt: "Forest trail",
      sceneAction: "He adjusts backpack",
      order: 1,
      total: 3
    });
    expect(prompt).toContain("Man, 40s, navy jacket");
    expect(prompt).toContain("Forest trail");
    expect(prompt).toContain("Scene 2 of 3");
    expect(prompt).toContain("EXACT same fictional characters");
  });

  it("applyContinuityToScript rewrites all scene prompts", () => {
    const out = applyContinuityToScript({
      ...baseScript(),
      characterBible: ""
    });
    expect(out.characterBible.length).toBeGreaterThan(10);
    for (const scene of out.scenes) {
      expect(scene.referenceImagePrompt).toContain("EXACT same fictional characters");
      expect(scene.visualPrompt).toContain("Same cast & location");
    }
  });
});
