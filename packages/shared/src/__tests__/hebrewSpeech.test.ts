import { describe, expect, it } from "vitest";
import { hebrewLetterSkeleton, pointHebrewForSpeech } from "../hebrewSpeech.js";

describe("pointHebrewForSpeech", () => {
  it("keeps vowel points only when the letters are unchanged", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          { word: "נחישות", options: ["נְחִישׁוּת"], fconfident: true },
          { word: " ", sep: true },
          { word: "אמיתית", options: ["אֲמִיתִּית"], fconfident: true }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    const pointed = await pointHebrewForSpeech("נחישות אמיתית", fetchImpl as typeof fetch);
    expect(pointed).toBe("נְחִישׁוּת אֲמִיתִּית");
    expect(hebrewLetterSkeleton(pointed)).toBe("נחישותאמיתית");
  });

  it("drops a token whose letters were rewritten and falls back if the sentence no longer matches", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          { word: "נחישות", options: ["נְחוֹשֶׁת"] },
          { word: " ", sep: true },
          { word: "אמיתית", options: ["אֲמִתִּית"] }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    const pointed = await pointHebrewForSpeech("נחישות אמיתית", fetchImpl as typeof fetch);
    expect(pointed).toBe("נחישות אמיתית");
  });

  it("leaves a word unpointed when the vocalizer is not confident", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          { word: "אוכל", options: ["אֹוֽכֶל"], fconfident: false },
          { word: " ", sep: true },
          { word: "שף", options: ["שֵׁף"], fconfident: true }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    expect(await pointHebrewForSpeech("אוכל שף", fetchImpl as typeof fetch)).toBe("אוכל שֵׁף");
  });

  it("returns the original text when the vocalizer is down", async () => {
    const fetchImpl = async () => {
      throw new Error("offline");
    };
    expect(await pointHebrewForSpeech("שלום", fetchImpl as typeof fetch)).toBe("שלום");
  });
});
