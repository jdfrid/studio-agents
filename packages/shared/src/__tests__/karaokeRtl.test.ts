import { describe, expect, it } from "vitest";
import {
  buildKaraokeAss,
  buildKaraokeCues,
  isRtlContentLanguage,
  stripNiqqud
} from "../karaokeCaptions.js";

describe("stripNiqqud", () => {
  it("removes vowel points but keeps letters", () => {
    expect(stripNiqqud("שָׁלוֹם")).toBe("שלום");
  });
});

describe("RTL karaoke", () => {
  it("detects he/ar as RTL", () => {
    expect(isRtlContentLanguage("he")).toBe(true);
    expect(isRtlContentLanguage("ar")).toBe(true);
    expect(isRtlContentLanguage("en")).toBe(false);
  });

  it("wraps RTL dialogue with RLE marks", () => {
    const cues = buildKaraokeCues("שלום עולם", 0, 2);
    const ass = buildKaraokeAss(cues, { language: "he" });
    expect(ass).toContain("\u202B");
    expect(ass).toContain("\u202C");
    expect(ass).toContain("{\\k");
  });

  it("does not wrap English with RLE", () => {
    const cues = buildKaraokeCues("Hello world", 0, 2);
    const ass = buildKaraokeAss(cues, { language: "en" });
    expect(ass).not.toContain("\u202B");
  });
});
