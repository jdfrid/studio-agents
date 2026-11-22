import { describe, expect, it } from "vitest";
import {
  applyPronunciationLexicon,
  buildProductDemo,
  estimateSpokenSeconds,
  evaluateShortsGate,
  filterShortsHashtags,
  fitShortScript,
  fitTitle,
  followCta,
  followWinner,
  incompleteLines,
  isGenericTitle,
  isNearDuplicate,
  kitchenRelevantPhrase,
  narrationFromScriptJson,
  nextProductDemo,
  nextSeriesTopic,
  rankTopicPerformance,
  seriesEpisode,
  seriesTitle,
  subscribeLine,
  PRODUCT_BUSINESSES,
  PRODUCT_FEATURES,
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

describe("product feature demos", () => {
  it("rotates features and business types", () => {
    const first = nextProductDemo({ recent: [], salt: 0 });
    expect(first?.featureId).toBe("branding");
    expect(first?.businessId).toBe("bakery");
    expect(first?.title.length).toBeLessThanOrEqual(60);
    expect(first?.script.startsWith(first.prompt)).toBe(true);
    expect(first?.script).toContain(first?.featureName);
    expect(first?.comment).toContain("https://reelmino.com");
    expect(first?.comment).toContain("Bakery in Tel Aviv");
    const second = nextProductDemo({
      recent: [{ featureId: first?.featureId, businessId: first?.businessId, title: first?.title }],
      salt: 0
    });
    expect(second?.featureId).not.toBe(first?.featureId);
    expect(second?.businessId).not.toBe(first?.businessId);
    const repeated = nextProductDemo({
      recent: PRODUCT_FEATURES.flatMap((feature) => PRODUCT_BUSINESSES.map((business) => ({ featureId: feature.id, businessId: business.id }))),
      salt: 1
    });
    expect(repeated?.businessId).not.toBe("bakery");
  });

  it("rejects a product short that is generic and a repeat of the same business", () => {
    const demo = buildProductDemo(PRODUCT_FEATURES[0]!, PRODUCT_BUSINESSES[0]!);
    const ready = gate({
      channel: "product",
      requireProductDemo: true,
      title: demo.title,
      description: demo.description,
      script: demo.script
    });
    expect(ready.decision).toBe("publish");
    expect(ready.description).toContain("https://reelmino.com");
    const unnamed = gate({
      channel: "product",
      requireProductDemo: true,
      title: demo.title,
      script: "A nice video for a bakery.\nTry it with your sentence - link in pinned comment.\nA nice video for a bakery."
    });
    expect(unnamed.reasons.join(" ")).toMatch(/feature/i);
    const noBusiness = gate({
      channel: "product",
      requireProductDemo: true,
      title: "Turn one sentence into a branded video",
      script: "Reelmino runs one sentence to full video.\nTry it with your sentence - link in pinned comment."
    });
    expect(noBusiness.reasons.join(" ")).toMatch(/business/i);
    const noCta = gate({
      channel: "product",
      requireProductDemo: true,
      title: demo.title,
      script: `Bakery in Tel Aviv, weekend sale 20% off.\nReelmino runs automatic branding for this bakery.`
    });
    expect(noCta.reasons.join(" ")).toMatch(/pinned-comment/i);
    const dup = gate({
      channel: "product",
      requireProductDemo: true,
      title: "Brand a gym video from a logo",
      description: demo.description,
      script: buildProductDemo(PRODUCT_FEATURES[0]!, PRODUCT_BUSINESSES[3]!).script,
      recent: [{ title: demo.title, script: demo.script, featureId: "branding", businessId: "bakery", publishedAt: new Date().toISOString() }, { title: "Brand a gym video from a logo", script: buildProductDemo(PRODUCT_FEATURES[0]!, PRODUCT_BUSINESSES[3]!).script, featureId: "branding", businessId: "gym", publishedAt: new Date().toISOString() }]
    });
    expect(dup.reasons.join(" ")).toMatch(/last 7 days/i);
    const old = gate({
      channel: "product",
      requireProductDemo: true,
      title: demo.title,
      description: demo.description,
      script: demo.script,
      recent: [{ title: "older bakery", script: demo.script, featureId: "branding", businessId: "bakery", publishedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() }]
    });
    expect(old.reasons.join(" ")).not.toMatch(/last 7 days/i);
    expect(gate({ script: herbScript }).decision).toBe("publish");
  });

  it("keeps a short script speakable, ignores an on-screen prompt fragment, and rotates features", () => {
    expect(incompleteLines("bedroom apartment for sale, sea view, open house")).toEqual([]);
    expect(kitchenRelevantPhrase("Anuel AA | SE TOCO EL T*TITO CON MI GL*CK (Video Oficial)")).toBe(false);
    expect(kitchenRelevantPhrase("How to keep fresh herbs alive")).toBe(true);
    const missing = "Reelmino runs automatic branding for this bakery.";
    const fitted = fitShortScript(missing, "product");
    expect(fitted).toMatch(/try it with your sentence/i);
    expect(fitted).toMatch(/pinned comment/i);
    expect(estimateSpokenSeconds(fitted)).toBeLessThanOrEqual(22);
    expect(incompleteLines(fitted)).toEqual([]);
    const features = [0, 1, 2].map((salt) => nextProductDemo({ recent: [], salt })?.featureId);
    expect(new Set(features).size).toBe(3);
    const businesses = [0, 1, 2].map((salt) => nextProductDemo({ recent: [], salt })?.businessId);
    expect(new Set(businesses).size).toBe(3);
    const titles = PRODUCT_FEATURES.flatMap((feature) => [feature.title]);
    const again = nextSeriesTopic({ kind: "kitchen", language: "en", recentTitles: titles.concat(["How to keep fresh herbs alive for weeks", "How to keep fresh produce crisp longer", "How to store leftovers so they stay fresh", "Where food should go in the fridge", "How to set up a small kitchen that works"]), salt: 2 });
    expect(again?.title.length).toBeGreaterThan(8);
  });

  it("weights about half of kitchen slots toward the winning topics and keeps the subscribe line inside 25 seconds", () => {
    const ranked = rankTopicPerformance([
      { title: "How to Keep Fresh Herbs Alive for Weeks", views: 236 },
      { title: "Keep Fresh Produce Crisp Longer", views: 144 },
      { title: "The Work Triangle Secret", views: 100 }
    ], "kitchen");
    expect(ranked.map((row) => row.topicId)).toEqual(["herbs", "produce", "kitchen-layout"]);
    const winners = ranked.map((row) => row.topicId);
    const followed: string[] = [];
    let winnerSlots = 0;
    for (let salt = 0; salt < 10; salt += 1) {
      const topic = nextSeriesTopic({
        kind: "kitchen",
        language: "en",
        recentTitles: [],
        salt,
        winners,
        preferWinner: followWinner(salt)
      });
      expect(topic?.id).toBeTruthy();
      if (!followWinner(salt)) continue;
      winnerSlots += 1;
      expect(winners).toContain(topic?.id);
      followed.push(`${topic?.id}:${topic?.angle}`);
    }
    expect(winnerSlots).toBe(5);
    expect(new Set(followed).size).toBeGreaterThan(1);
    const first = seriesTitle("Fresh Longer", seriesEpisode("Fresh Longer", []), "Stop letting fresh herbs die in a jar");
    const second = seriesTitle("Fresh Longer", seriesEpisode("Fresh Longer", [first]), "Dry the lettuce before it goes in the fridge");
    expect(first.startsWith("Fresh Longer #1")).toBe(true);
    expect(second.startsWith("Fresh Longer #2")).toBe(true);
    expect(isNearDuplicate({
      title: second,
      script: "Dry the lettuce before it goes in the fridge.",
      recent: [{ title: first, script: "Stop letting fresh herbs die in a jar." }]
    }).match).toBe(false);
    const fitted = fitShortScript("Stop letting fresh herbs die in a jar.\nTrim the stems.", "kitchen");
    expect(fitted).toContain(subscribeLine("kitchen"));
    expect(fitted.trim().endsWith(subscribeLine("kitchen"))).toBe(true);
    const spoken = estimateSpokenSeconds(fitted);
    const without = estimateSpokenSeconds(fitted.replace(subscribeLine("kitchen"), ""));
    expect(spoken).toBeGreaterThan(without);
    expect(spoken).toBeLessThanOrEqual(22);
    expect(evaluateShortsGate({
      mode: "publish",
      title: first,
      script: fitted,
      description: "Trim the stems.",
      language: "en",
      durationSeconds: spoken,
      channel: "kitchen"
    }).decision).toBe("publish");
    const product = fitShortScript("Reelmino runs automatic branding for this bakery.", "product");
    expect(product).toContain(subscribeLine("product"));
    expect(estimateSpokenSeconds(product)).toBeLessThanOrEqual(22);
  });
});
