import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCopy } from "./copy.js";
import { insertItem, insertJob, openDb, upsertDestination, type GrowthDb } from "./db.js";
import { REELMINO_CHANNEL_ID } from "./shortsSchedule.js";
import {
  advancePromoBackfill,
  applyPromoDescription,
  choosePromo,
  nextBackfillTarget,
  promoBackfillPerDay,
  promoCommentText,
  withPromoDescription,
  youtubeSnippetUpdate,
  type PromoUpload,
  type PromoVideo
} from "./promoLinks.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  delete process.env.SHORTS_PROMO_BACKFILL_PER_DAY;
});

function db(): GrowthDb {
  const dir = mkdtempSync(path.join(tmpdir(), "promo-"));
  dirs.push(dir);
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return opened;
}

const branding: PromoVideo = { videoId: "brand1", title: "Brand a bakery video from a logo", featureId: "branding", publishedAt: "2026-11-01T00:00:00.000Z" };
const sentence: PromoVideo = { videoId: "sent1", title: "Turn one sentence into a bakery video", featureId: "one-sentence", publishedAt: "2026-11-02T00:00:00.000Z" };
const speed: PromoVideo = { videoId: "speed1", title: "AI video ad for a gym in 60 seconds", featureId: "speed", publishedAt: "2026-11-03T00:00:00.000Z" };

describe("promo links", () => {
  it("rotates demos, keeps a product short off its own function, and prefers a kitchen topic", () => {
    const catalog = [branding, sentence, speed];
    expect(choosePromo({ catalog, channel: "product", featureId: "branding", selfVideoId: "brand1" })?.videoId).not.toBe("brand1");
    expect(choosePromo({ catalog, channel: "product", featureId: "branding", selfVideoId: "brand1" })?.featureId).not.toBe("branding");
    expect(choosePromo({ catalog, channel: "product", featureId: "branding" })?.videoId).toBe("sent1");
    expect(choosePromo({ catalog, channel: "product", featureId: "branding", recentIds: ["sent1"] })?.videoId).toBe("speed1");
    expect(choosePromo({ catalog, channel: "kitchen", title: "Finish in seconds", recentIds: [] })?.videoId).toBe("speed1");
    const line = withPromoDescription("One fix you can use today.", branding, "en");
    expect(line).toContain("See Reelmino do this: Brand a bakery video from a logo");
    expect(line).toContain("https://www.youtube.com/watch?v=brand1");
    expect(line).toContain("https://reelmino.com");
    expect(withPromoDescription(line, sentence, "en")).toBe(line);
    expect(promoCommentText({ kind: "kitchen", promo: branding, language: "en" })).toContain("watch?v=brand1");
    const product = promoCommentText({ kind: "product", script: "Bakery in Tel Aviv, weekend sale 20% off.", promo: sentence, language: "en" });
    expect(product).toContain("Bakery in Tel Aviv");
    expect(product).toContain("watch?v=sent1");
    expect(promoBackfillPerDay()).toBe(1);
    expect(promoBackfillPerDay("2")).toBe(2);
  });

  it("updates one recent description per day and keeps the existing tags", async () => {
    const now = new Date("2026-11-18T12:00:00.000Z");
    const rows: PromoUpload[] = [
      { ...branding, description: "old", channel: "product" },
      { ...sentence, description: "See Reelmino do this: already", channel: "product", publishedAt: "2026-11-10T00:00:00.000Z" },
      { videoId: "old", title: "Old", featureId: null, description: "old", channel: "kitchen", publishedAt: "2026-10-01T00:00:00.000Z" }
    ];
    expect(nextBackfillTarget(rows, now, [])?.videoId).toBe("brand1");
    expect(nextBackfillTarget(rows, now, ["brand1"])).toBeNull();
    const payload = youtubeSnippetUpdate("brand1", { title: "Brand", categoryId: "22", tags: ["shorts"], defaultLanguage: "en" }, "next");
    expect(payload.snippet.tags).toEqual(["shorts"]);
    expect(payload.snippet.categoryId).toBe("22");

    const opened = db();
    upsertDestination(opened, {
      id: "product",
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: REELMINO_CHANNEL_ID,
      name: "Reelmino",
      handle: "@reelminoapp",
      url: "https://www.youtube.com/channel/UC3iee8PYICmnfO5s8viJgkQ",
      config: {}
    });
    const copy = emptyCopy();
    copy.article.body = "Reelmino runs automatic branding for this bakery.";
    const item = insertItem(opened, {
      id: "item-1",
      slug: "item-1",
      source: "shorts-schedule",
      title: "Brand a bakery video from a logo",
      summary: "brand",
      language: "en",
      copy,
      mediaPath: null,
      mediaMime: null,
      mediaKind: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationMs: 20_000,
      reelminoRunId: null
    });
    insertJob(opened, { id: "job-1", itemId: item.id, destinationId: "product", slotId: null, network: "youtube", status: "published" });
    opened.prepare("UPDATE jobs SET remote_post_id = 'brand1' WHERE id = 'job-1'").run();
    opened.prepare("INSERT INTO settings (key, value) VALUES ('promo_catalog', ?)").run(JSON.stringify([branding, sentence, speed]));
    opened.prepare("INSERT INTO settings (key, value) VALUES ('promo_catalog_at', ?)").run(now.toISOString());
    const described = await applyPromoDescription(opened, item, { externalId: REELMINO_CHANNEL_ID, handle: "@reelminoapp" }, { body: "One sentence.", language: "en", title: item.title }, undefined, now);
    expect(described.body).toContain("watch?v=sent1");
    expect(described.body).not.toContain("watch?v=brand1");

    opened.prepare("INSERT INTO settings (key, value) VALUES ('promo_uploads:product', ?)").run(JSON.stringify([{ ...branding, description: "plain", channel: "product" }]));
    const updates: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/videos?part=snippet&id=")) {
        return new Response(JSON.stringify({ items: [{ snippet: { title: "Brand", description: "plain", categoryId: "22", tags: ["shorts"] } }] }), { status: 200 });
      }
      if (href.includes("/videos?part=snippet") && init?.method === "PUT") {
        updates.push(String(init.body));
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    try {
      await advancePromoBackfill(opened, { now, log: () => undefined, tokenFor: async () => "token" });
      await advancePromoBackfill(opened, { now, log: () => undefined, tokenFor: async () => "token" });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("shorts");
    expect(updates[0]).toContain("See Reelmino do this:");
  });
});
