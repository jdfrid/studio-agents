import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { briefForBrandVideo, createBrandContent, moveBrandItem, nextBrandVideo, orderedBrandItems } from "./brandDistribution.js";
import { emptyCopy } from "./copy.js";
import { insertItem, insertJob, openDb, upsertDestination, type GrowthDb } from "./db.js";
import { postsFromModel, saveTextCampaign, shapePost, textPrompt } from "./textPosts.js";

const dbs: GrowthDb[] = [];

function db(): GrowthDb {
  const dir = mkdtempSync(path.join(tmpdir(), "brand-"));
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return opened;
}

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

function video(opened: GrowthDb, slug: string, source: string): string {
  const item = insertItem(opened, {
    id: slug,
    slug,
    source,
    title: slug,
    summary: "Reelmino",
    language: "en",
    copy: emptyCopy(),
    mediaPath: `${slug}.mp4`,
    mediaMime: "video/mp4",
    mediaKind: "video",
    mediaWidth: 1080,
    mediaHeight: 1920,
    mediaDurationMs: 30000,
    reelminoRunId: null
  });
  return item.id;
}

describe("brand distribution", () => {
  it("keeps prepared packages in numeric order and skips a package that already went out", () => {
    const opened = db();
    upsertDestination(opened, {
      id: "brand",
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: "brand",
      name: "Reelmino",
      handle: "@reelminoapp",
      url: "https://www.youtube.com/@reelminoapp",
      config: {}
    });
    video(opened, "kit-10-late", "kit");
    video(opened, "kit-2-early", "kit");
    const content = createBrandContent(opened, { title: "What Reelmino does", summary: "One sentence becomes a branded video." });
    expect(orderedBrandItems(opened).map((item) => item.slug)).toEqual(["kit-2-early", "kit-10-late", content.item?.slug]);
    expect(moveBrandItem(opened, "kit-10-late", -1)).toBeNull();
    expect(orderedBrandItems(opened)[0]?.id).toBe("kit-10-late");
    insertJob(opened, { id: "sent", itemId: "kit-10-late", destinationId: "brand", slotId: null, network: "youtube", status: "published" });
    expect(nextBrandVideo(opened, "brand")?.id).toBe("kit-2-early");
    expect(briefForBrandVideo({ title: "One sentence", body: "Show the product.", language: "en", durationSeconds: 30 }).branding).toEqual({ slogan: "Click Subscribe" });
  });
});

describe("network text posts", () => {
  it("keeps an X post inside 280 characters and a LinkedIn post as a written post", () => {
    expect(shapePost("x", "a".repeat(300)).length).toBe(280);
    expect(postsFromModel("linkedin", [{ text: "A clear point about making a video." }, { text: "A clear point about making a video." }])).toEqual(["A clear point about making a video."]);
    const prompt = textPrompt({ network: "linkedin", query: "small business video", language: "en" });
    expect(prompt.system).toContain("LinkedIn");
    expect(prompt.system).toContain("does not read like a video script");
    const opened = db();
    const saved = saveTextCampaign(opened, { network: "x", query: "one sentence video", language: "en", hours: 4 });
    expect(saved.campaign).toMatchObject({ network: "x", language: "en", enabled: false });
  });
});
