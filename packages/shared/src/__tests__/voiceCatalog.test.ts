import { describe, expect, it } from "vitest";
import {
  geminiTtsStyleFromCreative,
  geminiVoiceNameFromCreative,
  presenterCastInstruction,
  resolvePresenterSex,
  resolveVoiceCharacterPreset,
  voiceAgeFromCreative,
  voicePitchSemitonesFromCreative,
  voiceSexFromCreative
} from "../index.js";

describe("voice character catalog", () => {
  it("maps adult and character presets to Gemini voices and timbre", () => {
    expect(geminiVoiceNameFromCreative({ voiceCharacter: "male_deep" })).toBe("Rasalgethi");
    expect(geminiVoiceNameFromCreative({ voiceCharacter: "female_soft" })).toBe("Sulafat");
    expect(geminiVoiceNameFromCreative({ voiceCharacter: "child_boy" })).toBe("Puck");
    expect(geminiVoiceNameFromCreative({ voiceCharacter: "baby" })).toBe("Leda");
    expect(geminiVoiceNameFromCreative({ voiceCharacter: "distorted" })).toBe("Algenib");
    expect(voicePitchSemitonesFromCreative({ voiceCharacter: "baby" })).toBe(5);
    expect(voicePitchSemitonesFromCreative({ voiceCharacter: "distorted" })).toBe(-3);
    expect(voicePitchSemitonesFromCreative({ voiceCharacter: "male_clear" })).toBeUndefined();
  });

  it("keeps legacy Hebrew voiceType drafts working", () => {
    expect(resolveVoiceCharacterPreset({ voiceType: "עמוק" })?.id).toBe("male_deep");
    expect(geminiVoiceNameFromCreative({ voiceType: "רשמי" })).toBe("Orus");
    expect(voiceSexFromCreative({ voiceType: "עמוק" })).toBe("male");
  });

  it("puts timbre in TTS style and leaves speechStyle as delivery", () => {
    const style = geminiTtsStyleFromCreative({
      voiceCharacter: "child_girl",
      speechStyle: "הומוריסטי"
    });
    expect(style).toContain("Young girl child voice");
    expect(style).toContain("הומוריסטי");
    expect(style).not.toContain("child_girl");
  });

  it("locks child and baby voices to matching on-screen age", () => {
    expect(voiceAgeFromCreative({ voiceCharacter: "child_boy" })).toBe("child");
    expect(voiceAgeFromCreative({ voiceCharacter: "baby" })).toBe("baby");
    expect(voiceAgeFromCreative({ voiceCharacter: "male_news" })).toBeUndefined();
    expect(resolvePresenterSex({ creative: { voiceCharacter: "child_girl" } })).toBe("female");
    const instruction = presenterCastInstruction({
      sex: "male",
      userLocked: true,
      age: "child"
    });
    expect(instruction).toContain("boy (male child");
    expect(instruction).toContain("Age lock");
    expect(instruction).not.toContain("female adult");
  });
});
