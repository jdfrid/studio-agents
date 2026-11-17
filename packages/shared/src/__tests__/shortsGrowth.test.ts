import { describe, expect, it } from "vitest";
import {
  applyPronunciationLexicon,
  evaluateShortsGate,
  filterShortsHashtags,
  fitTitle,
  followCta,
  isGenericTitle,
  narrationFromScriptJson,
  nextSeriesTopic,
  shortsBriefSeconds,
  shortsDescription,
  shortsProductionNotes,
  withPronunciation,
  type ShortsGateInput
} from "../shortsGrowth.js";

const herbScript = [
  "Stop letting your fresh herbs turn into slimy green mush in the fridge.",
  "Trim the stems and stand them in a glass of water.",
  "Stop letting your fresh herbs turn into slimy green mush in the fridge."
].join("\n");

function gate(patch: Partial<ShortsGateInput> = {}) {
  const input: ShortsGateInput = {
    title: "How to keep fresh herbs alive for weeks",
    description: "Trim the stems and stand them in water.",
    script: herbScript,
    language: "en",
    durationSeconds: 18,
    hashtags: ["to", "save", "wooden", "herbs"],
    channel: "kitchen",
    publishedToday: 0,
    dailyCap: 3,
    recent: [],
    ...patch
  };
  return evaluateShortsGate(input);
}

describe("shorts growth template", () => {
  it("targets 20 seconds and keeps a longer cut when one was chosen", () => {
    expect(shortsBriefSeconds(30)).toBe(20);
    expect(shortsBriefSeconds(600)).toBe(600);
    expect(followCta("en")).toBe("Follow for one fix a day");
    expect(followCta("he")).toBe("עקבו לטיפ אחד ביום");
  });

  it("writes a search title, a real description, and hashtags without stopwords", () => {
    const fitted = fitTitle("How to keep fresh herbs alive for weeks and then some extra words that run past the limit");
    expect(fitted.length).toBeLessThanOrEqual(60);
    expect(fitted.endsWith(" ")).toBe(false);
    expect(fitted.startsWith("How to keep")).toBe(true);
    expect(isGenericTitle("What matters now")).toBe(true);
    expect(filterShortsHashtags(["to", "save", "wooden", "herbs", "יצירת"], "en")).toEqual(["shorts", "herbs"]);
    const kitchen = shortsDescription({
      title: "How to keep fresh herbs alive for weeks",
      script: herbScript,
      language: "en",
      kind: "kitchen",
      hashtags: ["to", "save", "wooden"]
    });
    expect(kitchen).toContain("Stop letting your fresh herbs");
    expect(kitchen).toContain("Made with Reelmino.");
    expect(kitchen).not.toContain("reelmino.com");
    expect(kitchen).not.toContain("vertical video that follows");
    expect(kitchen).not.toContain("#wooden");
    expect(kitchen).toContain("#shorts");
    const product = shortsDescription({
      title: "I made this ad from one sentence",
      script: "I made this ad from one sentence.\nThe mascot says the offer.",
      language: "en",
      kind: "product"
    });
    expect(product).toContain("https://reelmino.com");
    expect(shortsProductionNotes({ kind: "product", language: "en" })).toContain("one sentence");
    expect(shortsProductionNotes({ kind: "kitchen", language: "he" })).toContain("תפסיקו");
  });

  it("says Reelmino as one word and leaves the domain alone", () => {
    expect(applyPronunciationLexicon("Reelmino turns one sentence into a video.", "en")).toBe(
      "Rihlmeenoh turns one sentence into a video."
    );
    expect(applyPronunciationLexicon("People say Real Mino.", "en")).toBe("People say Rihlmeenoh.");
    expect(applyPronunciationLexicon("See https://reelmino.com today.", "en")).toContain("reelmino.com");
    expect(applyPronunciationLexicon("Reelmino", "he")).toBe("רילמינו");
    expect(withPronunciation("Made with Reelmino.", "en").style).toContain("real mino");
    expect(withPronunciation("Cut the herbs.", "en").style).toBe("");
  });

  it("rotates proven kitchen topics instead of repeating the herb film", () => {
    const next = nextSeriesTopic({
      kind: "kitchen",
      language: "en",
      recentTitles: ["How to keep fresh herbs alive for weeks"]
    });
    expect(next?.id).not.toBe("herbs");
    expect(next?.title.toLowerCase()).toMatch(/produce|leftover|fridge|kitchen/);
    expect(nextSeriesTopic({ kind: "kitchen", language: "he", recentTitles: [] })?.title).toMatch(/\p{Script=Hebrew}/u);
  });

  it("reads narration out of a saved script artifact", () => {
    expect(narrationFromScriptJson(JSON.stringify({ scenes: [{ narration: "Stop wasting herbs." }, { narration: "" }] }))).toBe(
      "Stop wasting herbs."
    );
    expect(narrationFromScriptJson("not json")).toBe("");
  });
});

describe("shorts quality gate", () => {
  it("publishes a specific herb short and drops junk tags", () => {
    const result = gate({});
    expect(result.decision).toBe("publish");
    expect(result.hashtags).toContain("herbs");
    expect(result.hashtags).not.toContain("wooden");
    expect(result.description).not.toContain("#to");
  });

  it("blocks the titles and leaks that already shipped", () => {
    expect(gate({ title: "What matters now" }).reasons.join(" ")).toMatch(/generic/i);
    expect(gate({ title: "אשה מדברת בסגנון קליל ומצחיק", language: "he", script: "אשה מדברת בסגנון קליל ומצחיק." }).decision).toBe("block");
    expect(gate({ title: "How to keep herbs alive", language: "he", script: "תפסיקו לזרוק עשבי תיבול.\nשמים אותם במים." }).reasons.join(" ")).toMatch(/language/i);
    expect(
      gate({
        description: "A vertical video that follows the saved script. #to #save",
        script: herbScript
      }).decision
    ).toBe("block");
  });

  it("blocks a repeat from the last two weeks, a bad opening, a cut sentence, and a long short", () => {
    const duplicate = gate({
      recent: [{ title: "How to keep fresh herbs alive for weeks", script: herbScript }]
    });
    expect(duplicate.decision).toBe("block");
    expect(duplicate.reasons.join(" ")).toMatch(/duplicate/i);
    const intro = gate({
      script: "Welcome back to the channel.\nTrim the herbs and stand them in water."
    });
    expect(intro.reasons.join(" ")).toMatch(/opening/i);
    const cut = gate({
      script: "Stop letting your fresh herbs turn into slimy green mush"
    });
    expect(cut.reasons.join(" ")).toMatch(/cut off/i);
    expect(gate({ durationSeconds: 31, mode: "publish" }).reasons.join(" ")).toMatch(/25/);
    expect(gate({ durationSeconds: 18, mode: "publish" }).decision).toBe("publish");
    expect(gate({ durationSeconds: 600, mode: "publish" }).reasons.join(" ")).not.toMatch(/25/);
  });

  it("stops the fourth short of the day and flags a weak title match for approval", () => {
    const capped = gate({ publishedToday: 3, dailyCap: 3 });
    expect(capped.decision).toBe("block");
    expect(capped.code).toBe("shorts_daily_cap");
    const weak = gate({
      title: "How to store fresh herbs",
      script: "Keep the fresh stems in a glass of water.\nChange that water every morning."
    });
    expect(weak.decision).toBe("review");
    expect(weak.reasons[0]).toMatch(/Needs approval/);
    const listingOnly = gate({
      title: "How to store cut onions",
      description: "How to store cut onions. Keep the cut face in a jar.",
      script: herbScript
    });
    expect(listingOnly.decision).toBe("block");
    expect(listingOnly.reasons.join(" ")).toMatch(/does not describe the script/i);
    const judged = gate({ titleVerdict: { matches: false, reason: "The title is about onions and the film is about herbs" } });
    expect(judged.decision).toBe("block");
    expect(judged.reasons.join(" ")).toMatch(/onions/);
  });
});
