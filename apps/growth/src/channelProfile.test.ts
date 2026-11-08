import { describe, expect, it } from "vitest";
import { applyVideoProfile, profileFor } from "./channelProfile.js";

describe("channel profiles", () => {
  it("explains each channel and keeps Reelmino in the keywords", () => {
    const brand = profileFor({ handle: "@reelminoapp", name: "Reelmino" });
    const kitchen = profileFor({ handle: "@kitchentips-reelmino", name: "Reelmino Kitchen Tips" });
    for (const profile of [brand, kitchen]) {
      expect(profile.description.length).toBeLessThanOrEqual(1000);
      expect(profile.keywords.length).toBeLessThanOrEqual(500);
      expect(profile.description).toContain("Reelmino");
      expect(profile.description).toContain("יצירת וידאו");
      expect(profile.keywords).toContain('"video creation"');
      expect(profile.keywords).toContain('"יצירת וידאו"');
      expect(profile.videoTags).toContain("video creation");
      expect(profile.videoTags).toContain("יצירת וידאו");
    }
    expect(brand.keywords).toContain('"video ads"');
    expect(kitchen.description).toContain("kitchen");
    expect(kitchen.keywords).toContain('"kitchen tips"');
    expect(kitchen.keywords).toContain('"טיפים למטבח"');
  });

  it("adds the system line to an English video without Hebrew in the description", () => {
    const copy = applyVideoProfile(
      { title: "Keep herbs alive", body: "Store the stems in water.", language: "en", hashtags: ["herbs"] },
      { handle: "@kitchentips-reelmino", name: "Reelmino Kitchen Tips" }
    );
    expect(copy.body).toContain("Store the stems in water.");
    expect(copy.body).toContain("Video creation");
    expect(copy.body).toContain("https://reelmino.com");
    expect(copy.body).not.toMatch(/\p{Script=Hebrew}/u);
    expect(copy.hashtags).toContain("יצירת וידאו");
    expect(copy.hashtags).toContain("kitchen tips");
    expect(copy.hashtags).toContain("herbs");
  });

  it("writes a Hebrew video description in Hebrew and still tags video creation", () => {
    const copy = applyVideoProfile(
      { title: "סרטון לעסק", body: "משפט אחד מספיק.", language: "he", hashtags: [] },
      { handle: "@reelminoapp", name: "Reelmino" }
    );
    expect(copy.body).toContain("יצירת וידאו");
    expect(copy.body).toContain("https://reelmino.com");
    expect(copy.hashtags).toContain("video creation");
    expect(copy.hashtags).toContain("video ads");
  });
});
