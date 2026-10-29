import { describe, expect, it } from "vitest";
import { hebrewLetterSkeleton, pointHebrewForSpeech } from "../hebrewSpeech.js";

describe("pointHebrewForSpeech", () => {
  it("keeps vowel points only when the letters are unchanged", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          { word: "נחישות", options: ["נְחִישׁוּת"] },
          { word: " ", sep: true },
          { word: "אמיתית", options: ["אֲמִיתִּית"] }
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

  it("returns the original text when the vocalizer is down", async () => {
    const fetchImpl = async () => {
      throw new Error("offline");
    };
    expect(await pointHebrewForSpeech("שלום", fetchImpl as typeof fetch)).toBe("שלום");
  });
});
