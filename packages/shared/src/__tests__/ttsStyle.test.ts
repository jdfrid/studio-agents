import { describe, expect, it } from "vitest";
import { buildTtsDeliveryStyle, geminiTtsStyleFromCreative } from "../creativeOptions.js";

describe("geminiTtsStyleFromCreative", () => {
  it("includes designStyle and event context when set", () => {
    const style = geminiTtsStyleFromCreative({
      speechStyle: "חם ואישי",
      designStyle: "חתונה קלאסית",
      location: "גן אירועים בחוף",
      communicationStyle: "מרגש",
      targetAudience: "אורחים",
      pace: "רגוע"
    });
    expect(style).toBeTruthy();
    expect(style!).toContain("חתונה קלאסית");
    expect(style!).toContain("גן אירועים בחוף");
    expect(style!).toContain("מרגש");
    expect(style!).toContain("אורחים");
    expect(style!).toContain("רגוע");
  });

  it("returns undefined when creative has no style fields", () => {
    expect(geminiTtsStyleFromCreative({})).toBeUndefined();
    expect(geminiTtsStyleFromCreative(null)).toBeUndefined();
  });
});

describe("buildTtsDeliveryStyle", () => {
  it("merges brief tone with creative designStyle", () => {
    const style = buildTtsDeliveryStyle({
      creative: { designStyle: "דוקומנטרי", speechStyle: "חדשותי" },
      title: "פתיחת חנות",
      toneOfVoice: "מקצועי",
      summary: "אירוע השקה לקהל מקומי"
    });
    expect(style).toBeTruthy();
    expect(style!).toContain("דוקומנטרי");
    expect(style!).toContain("מקצועי");
    expect(style!).toContain("פתיחת חנות");
  });
});
