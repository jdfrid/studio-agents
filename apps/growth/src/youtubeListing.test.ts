import { describe, expect, it } from "vitest";
import { emptyCopy } from "./copy.js";
import { clickTitle, detailedDescription, listingKeywords, prepareYouTubeListing, youtubeFileName, youtubeReleaseAt, YOUTUBE_PRIVATE_MS } from "./youtubeListing.js";

describe("youtube listing", () => {
  it("holds a new upload private for two hours", () => {
    const now = Date.parse("2026-11-10T10:00:00.000Z");
    expect(youtubeReleaseAt(now).toISOString()).toBe(new Date(now + YOUTUBE_PRIVATE_MS).toISOString());
  });

  it("keeps a typed title and writes same-language keywords into the description and the file name", () => {
    expect(clickTitle({ title: "תפוחי אדמה קריספיים בתנור", locked: true, language: "en", keywords: ["crispy"] })).toBe("תפוחי אדמה קריספיים בתנור");
    const described = detailedDescription({
      title: "Keep herbs alive",
      body: "Store the stems in water.",
      summary: "A kitchen tip about herbs.",
      sourceText: "חיתוך בצל",
      language: "en"
    });
    expect(described.body).toContain("Store the stems in water.");
    expect(described.body).toContain("In this video:");
    expect(described.body).not.toMatch(/\p{Script=Hebrew}/u);
    expect(described.keywords).not.toContain("חיתוך");
    const file = youtubeFileName("Keep herbs alive", described.keywords);
    expect(file.endsWith(".mp4")).toBe(true);
    expect(file.toLowerCase()).toContain("keep herbs alive");
  });

  it("turns a flat generated title into a title that carries a keyword", () => {
    const copy = emptyCopy();
    copy.article = { title: "Herbs", description: "Storage", body: "Store cut herbs standing in a glass of water." };
    const prepared = prepareYouTubeListing(
      {
        source: "calendar",
        title: "Herb storage",
        summary: "Store cut herbs standing in a glass of water.",
        language: "en",
        copy
      },
      { title: "Herb storage", body: "Store cut herbs standing in a glass of water.", hashtags: [], language: "en" }
    );
    expect(prepared.copy.title?.toLowerCase()).toContain("herb");
    expect(prepared.copy.title).not.toBe("Herb storage");
    expect(listingKeywords("חיתוך בצל onion", "he")).toEqual(["חיתוך", "בצל"]);
  });
});
