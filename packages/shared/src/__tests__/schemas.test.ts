import { describe, expect, it } from "vitest";
import {
  BriefInputSchema,
  BriefOutputSchema,
  ScriptOutputSchema,
  SceneSpecSchema,
  SubtitleStyleSchema,
  resolveSubtitleStyle
} from "../index.js";

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
  it("accepts an analysis-only reference video", () => {
    const parsed = BriefInputSchema.parse({
      title: "Reference",
      sourceText: "Create an original explainer",
      attachments: [
        {
          name: "inspiration.mp4",
          mimeType: "video/mp4",
          kind: "video",
          role: "reference_video",
          dataUrl: "data:video/mp4;base64,AAAA"
        }
      ],
      creative: {
        filmTemplate: "social_explainer",
        communicationStyle: "הסברתי"
      }
    });
    expect(parsed.attachments[0]?.role).toBe("reference_video");
    expect(parsed.creative?.filmTemplate).toBe("social_explainer");
  });
  it("brief output requires required fields", () => {
    expect(() => BriefOutputSchema.parse({})).toThrow();
  });
  it("preserves bounded subtitle controls in the brief", () => {
    const parsed = BriefInputSchema.parse({
      title: "Styled captions",
      sourceText: "Use readable captions",
      creative: {
        subtitlePosition: "top",
        subtitleSize: "large",
        subtitleFont: "noto_serif",
        subtitleRotation: "-8",
        subtitleEffect: "background"
      }
    });
    expect(parsed.creative?.subtitlePosition).toBe("top");
    expect(parsed.creative?.subtitleEffect).toBe("background");
  });
  it("keeps structured reference-video analysis in brief output", () => {
    const parsed = BriefOutputSchema.parse({
      title: "Original explainer",
      summary: "An original production informed by pacing only",
      targetAudience: "Families",
      toneOfVoice: "Friendly",
      style: "3D explainer",
      durationSeconds: 30,
      aspectRatio: "9:16",
      language: "he",
      brandConstraints: [],
      visualDirection: "Original cast and setting",
      musicDirection: "Light",
      budgetMode: false,
      renderProfile: "veo-multiclip",
      referenceVideoAnalysis: {
        summary: "Fast vertical explainer",
        visualStyle: "Soft 3D",
        colorPalette: "Warm",
        shotRhythm: "Five-second beats",
        cameraLanguage: "Medium shots and close-ups",
        captionStyle: "Bold lower-center captions",
        storyStructure: "Problem, checks, solution",
        reusableDirections: ["Open with a visual problem"]
      }
    });
    expect(parsed.referenceVideoAnalysis?.shotRhythm).toBe("Five-second beats");
  });
});

describe("Subtitle style schema", () => {
  it("resolves defaults for old runs", () => {
    expect(resolveSubtitleStyle(undefined)).toEqual({
      position: "bottom",
      size: "medium",
      font: "dejavu_sans",
      rotation: "0",
      effect: "outline"
    });
  });

  it("rejects arbitrary renderer/filter values", () => {
    expect(() => SubtitleStyleSchema.parse({ position: "x=0:y=0", rotation: "360" })).toThrow();
    expect(() => SubtitleStyleSchema.parse({ font: "../../evil.ttf" })).toThrow();
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
        backgroundVisualPrompt: "b",
        characterBible: "Fixed cast"
      })
    ).toThrow();
  });
  it("script output requires character bible", () => {
    expect(() =>
      ScriptOutputSchema.parse({
        scenes: [
          {
            id: "a",
            order: 0,
            title: "T",
            narration: "N",
            visualPrompt: "V",
            veoPrompt: "Veo",
            durationSeconds: 8
          }
        ],
        totalDurationSeconds: 8,
        musicPrompt: "m",
        backgroundVisualPrompt: "b"
      })
    ).toThrow();
  });
});
