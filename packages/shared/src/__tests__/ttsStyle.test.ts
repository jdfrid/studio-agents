import { describe, expect, it } from "vitest";
import {
  buildTtsDeliveryStyle,
  geminiDialogueVoicePair,
  geminiTtsStyleFromCreative,
  inferCastSexesFromBible,
  inferSexFromUserCopy,
  resolvePresenterSex,
  voiceSexFromCreative
} from "../creativeOptions.js";

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

describe("geminiDialogueVoicePair", () => {
  it("uses two male voices when characterBible has two men even without a voiceGender pick", () => {
    const pair = geminiDialogueVoicePair(
      {},
      "Character A: male, 40, short hair. Character B: male, 35, beard.",
      "he"
    );
    expect(["Charon", "Puck", "Fenrir", "Orus"]).toContain(pair.primary);
    expect(["Charon", "Puck", "Fenrir", "Orus"]).toContain(pair.secondary);
    expect(pair.primary).not.toBe(pair.secondary);
  });

  it("uses opposite sexes when bible has mixed cast", () => {
    const pair = geminiDialogueVoicePair(
      { voiceGender: "male" },
      "Host: male news anchor. Guest: female reporter."
    );
    const male = /^(Charon|Puck|Fenrir|Orus)$/i.test(pair.primary);
    const secondaryMale = /^(Charon|Puck|Fenrir|Orus)$/i.test(pair.secondary);
    expect(male).toBe(true);
    expect(secondaryMale).toBe(false);
  });
});

describe("inferCastSexesFromBible", () => {
  it("detects two Hebrew men", () => {
    expect(inferCastSexesFromBible("דמות א: גבר מבוגר. דמות ב: גבר צעיר.")).toEqual(["male", "male"]);
  });
});

describe("presenter sex lock", () => {
  it("treats unset Hebrew voice as female until the cast is known", () => {
    expect(voiceSexFromCreative({})).toBeUndefined();
    expect(resolvePresenterSex({ language: "he" })).toBe("female");
  });

  it("follows an on-screen male cast when the user did not pick a voice", () => {
    expect(resolvePresenterSex({ language: "he", characterBible: "גבר בן 40 בחליפה כהה" })).toBe("male");
  });

  it("reads an explicit woman from the user brief", () => {
    expect(inferSexFromUserCopy("סרטון עם מגישה באולפן")).toBe("female");
    expect(resolvePresenterSex({ language: "he", userText: "מגישה באולפן" })).toBe("female");
  });
});
