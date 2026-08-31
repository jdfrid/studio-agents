import { describe, expect, it } from "vitest";
import {
  buildKaraokeAss,
  buildKaraokeCues,
  isRtlContentLanguage,
  isolateLtrRuns,
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
    expect(ass).toContain("שלום\u200F ");
  });

  it("isolates numbers and Latin names inside Hebrew logical-order text", () => {
    expect(isolateLtrRuns("מבצע 25% על iPhone-15 היום")).toBe(
      "מבצע \u206625%\u2069 על \u2066iPhone-15\u2069 היום"
    );
    const ass = buildKaraokeAss(buildKaraokeCues("מבצע 25% על iPhone-15 היום", 0, 3), {
      language: "he"
    });
    expect(ass).toContain("\u206625%\u2069");
    expect(ass).toContain("\u2066iPhone-15\u2069");
  });

  it("does not wrap English with RLE", () => {
    const cues = buildKaraokeCues("Hello world", 0, 2);
    const ass = buildKaraokeAss(cues, { language: "en" });
    expect(ass).not.toContain("\u202B");
  });
});

describe("subtitle styling", () => {
  it("keeps backward-compatible defaults", () => {
    const ass = buildKaraokeAss(buildKaraokeCues("Hello world", 0, 2));
    expect(ass).toContain("Style: Karaoke,Arial,52,");
    expect(ass).toContain(",0,1,3,0,2,40,40,90,1");
  });

  it("maps every bounded control to ASS style fields", () => {
    const ass = buildKaraokeAss(buildKaraokeCues("שלום עולם", 0, 2), {
      language: "he",
      fontName: "Noto Serif Hebrew",
      width: 1280,
      height: 720,
      style: {
        position: "top",
        size: "large",
        font: "noto_serif",
        rotation: "8",
        effect: "background"
      }
    });
    expect(ass).toContain("PlayResX: 1280");
    expect(ass).toContain("Style: Karaoke,Noto Serif Hebrew,64,");
    expect(ass).toContain(",8,3,7,0,8,40,40,51,1");
  });
});
