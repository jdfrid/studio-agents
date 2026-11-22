import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, upsertDestination, type GrowthDb } from "./db.js";
import { KITCHEN_CHANNEL_ID } from "./shortsSchedule.js";
import {
  advanceSubscriberGrowth,
  commentDecision,
  crossPostCaption,
  crossPostTargets,
  ensureChapterDescription,
  evaluateLongForm,
  finishReply,
  longFormBackoffMs,
  longFormDecision,
  playlistEdits,
  playlistTargets,
  longFormPackage,
  playlistForKitchen,
  playlistsForProduct,
  rankDemand,
  replyAllowsLink,
  sundaySlot,
  tuneMultiplier
} from "./subscriberGrowth.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  for (const key of ["BUFFER_ACCESS_TOKEN", "BUFFER_CHANNEL_ID", "TIKTOK_ACCESS_TOKEN", "SHORTS_COMMENT_REPLIES", "SHORTS_PLAYLISTS", "SHORTS_LONGFORM", "SHORTS_TOPIC_DEMAND", "SHORTS_WEIGHT_TUNING", "SHORTS_CROSSPOST"]) {
    delete process.env[key];
  }
});

function db(): { db: GrowthDb; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "subscriber-"));
  dirs.push(dir);
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return { db: opened, dir };
}

describe("subscriber growth", () => {
  it("files a kitchen short and a product short into search playlists", () => {
    expect(playlistForKitchen("How to keep fresh herbs alive for weeks").title).toBe("Keep fresh herbs alive");
    expect(playlistForKitchen("Where food should go in the fridge").title).toBe("Food storage that works");
    const product = playlistsForProduct("branding", "bakery");
    expect(product.map((item) => item.title)).toEqual(["Automatic branding", "Reelmino for bakery"]);
  });

  it("accepts a chaptered long video and rejects a greeting", () => {
    const pack = longFormPackage({ kind: "kitchen", topic: "keep food fresh", parts: ["Herbs", "Produce", "Leftovers"] });
    expect(evaluateLongForm(pack).ok).toBe(true);
    expect(evaluateLongForm({ ...pack, script: "Welcome back.\nSubscribe.\nSubscribe." }).ok).toBe(false);
    const sunday = sundaySlot(new Date("2026-11-15T12:00:00.000Z"), "Asia/Jerusalem");
    expect(longFormDecision(new Date(sunday.leadAt.getTime() - 60_000), sunday, null)).toBe("wait");
    expect(longFormDecision(new Date(sunday.leadAt.getTime() + 60_000), sunday, null)).toBe("start");
    expect(longFormDecision(new Date(sunday.graceEnd.getTime() + 60_000), sunday, null)).toBe("skip");
    expect(longFormDecision(sunday.at, sunday, "published")).toBe("wait");
    expect(longFormDecision(sunday.at, sunday, "upload_failed")).toBe("retry");
    expect(longFormDecision(sunday.at, sunday, "upload_failed", 1, sunday.at)).toBe("wait");
    expect(longFormDecision(new Date(sunday.at.getTime() + longFormBackoffMs(1) + 1000), sunday, "upload_failed", 1, sunday.at)).toBe("retry");
    expect(longFormDecision(sunday.at, sunday, "failed", 3, null)).toBe("skip");
    const repaired = ensureChapterDescription("A long video without timestamps.", "Keep the herbs.\nDry the produce.\nLabel the leftovers.");
    expect(evaluateLongForm({ title: "3 tricks to keep food fresh", description: repaired, script: "Keep the herbs.\nSubscribe.\nSubscribe.", durationSeconds: 240 }).ok).toBe(true);
    expect(playlistTargets("product", "Brand a restaurant video from a logo").map((item) => item.title)).toEqual(["Automatic branding", "Reelmino for restaurant"]);
    expect(playlistTargets("product", "A quiet afternoon").map((item) => item.title)).toEqual([]);
    const edits = playlistEdits({
      kind: "product",
      items: [{ playlistKey: "business:bakery", playlistItemId: "pi1", videoId: "v1", title: "Brand a restaurant video from a logo" }]
    });
    expect(edits.remove).toEqual(["pi1"]);
    expect(edits.add.some((item) => item.playlistKey === "business:restaurant" && item.videoId === "v1")).toBe(true);
  });

  it("replies only to real comments, once, and caps the length", () => {
    expect(commentDecision("How do I keep herbs alive?")).toBe("reply");
    expect(commentDecision("Love this tip")).toBe("reply");
    expect(commentDecision("Buy followers now")).toBe("skip");
    expect(commentDecision("This is a scam and I want a refund")).toBe("skip");
    expect(commentDecision("Vote Trump")).toBe("skip");
    expect(finishReply("Store the stems in water").endsWith("?")).toBe(true);
    expect(finishReply("x".repeat(400)).length).toBeLessThanOrEqual(200);
    expect(replyAllowsLink("How do I try this?", true)).toBe(true);
    expect(replyAllowsLink("How do I try this?", false)).toBe(false);
  });

  it("keeps tuned weights inside half to double and ranks demand without publishing", () => {
    expect(tuneMultiplier({ views: 10, viewRatio: 10, subs: 0, medianViews: 100 })).toBeGreaterThanOrEqual(0.5);
    expect(tuneMultiplier({ views: 10_000, viewRatio: 100, subs: 5, medianViews: 10 })).toBeLessThanOrEqual(2);
    expect(rankDemand(["Keep herbs alive", "Keep herbs alive", "Crisp lettuce"]).map((item) => item.phrase)[0]).toBe("Keep herbs alive");
    expect(crossPostCaption("Keep herbs alive", "https://www.youtube.com/channel/UCsKPN8oZJOPM4KJC4bN_ANw")).toContain("More on YouTube: https://www.youtube.com/channel/UCsKPN8oZJOPM4KJC4bN_ANw");
    expect(crossPostTargets()).toEqual({ buffer: false, tiktok: false, instagram: false, facebook: false });
  });

  it("creates a playlist once, replies once, and does not add an upload", async () => {
    const opened = db();
    upsertDestination(opened.db, {
      id: "kitchen",
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: KITCHEN_CHANNEL_ID,
      name: "Kitchen Tips",
      handle: "@KitchenTips-Reelmino",
      url: "https://www.youtube.com/channel/UCsKPN8oZJOPM4KJC4bN_ANw",
      config: {}
    });
    const created: string[] = [];
    const replies: string[] = [];
    const deps = {
      now: new Date("2026-11-15T10:00:00.000Z"),
      log: () => undefined,
      listPlaylists: async () => [],
      createPlaylist: async (_channelId: string, spec: { title: string }) => {
        created.push(spec.title);
        return `pl-${created.length}`;
      },
      addToPlaylist: async () => undefined,
      listUploads: async () => [{ id: "old1", title: "How to keep fresh herbs alive for weeks" }],
      listComments: async () => [
        { id: "c1", threadId: "t1", text: "How do I store herbs?", videoId: "v1", replyCount: 0 },
        { id: "c2", threadId: "t2", text: "Buy followers now", videoId: "v1", replyCount: 0 }
      ],
      reply: async (_id: string, text: string) => { replies.push(text); },
      llm: async () => "Stand them in a glass of water",
      signals: async () => ["Keep herbs alive", "Keep herbs alive"]
    };
    const ctx = { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1" };
    await advanceSubscriberGrowth(ctx, deps);
    expect(created.length).toBeGreaterThan(0);
    expect(replies).toEqual(["Stand them in a glass of water?"]);
    const playlists = created.length;
    await advanceSubscriberGrowth(ctx, { ...deps, now: new Date("2026-11-15T10:30:00.000Z") });
    expect(created).toHaveLength(playlists);
    expect(replies).toHaveLength(1);
  });
});
