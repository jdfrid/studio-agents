import { describe, expect, it } from "vitest";
import { resolveElevenLabsSpeech } from "./elevenLabsSpeech.js";

describe("resolveElevenLabsSpeech", () => {
  it("speaks Hebrew on eleven_v3 with an unpointed script", () => {
    const speech = resolveElevenLabsSpeech({
      text: "נְחִישׁוּת אמיתית",
      language: "he-IL",
      model: "eleven_multilingual_v2"
    });
    expect(speech.modelId).toBe("eleven_v3");
    expect(speech.languageCode).toBe("he");
    expect(speech.text).toBe("נחישות אמיתית");
  });

  it("keeps an explicit Hebrew-capable model", () => {
    const speech = resolveElevenLabsSpeech({
      text: "שלום",
      language: "he",
      model: "eleven_v3"
    });
    expect(speech.modelId).toBe("eleven_v3");
    expect(speech.languageCode).toBe("he");
  });

  it("does not send a language code to a model that ignores it", () => {
    const speech = resolveElevenLabsSpeech({
      text: "Hello",
      language: "en",
      model: "eleven_multilingual_v2"
    });
    expect(speech.modelId).toBe("eleven_multilingual_v2");
    expect(speech.languageCode).toBeNull();
    expect(speech.text).toBe("Hello");
  });
});
