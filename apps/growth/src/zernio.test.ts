import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { insertItem, insertJob, openDb, upsertDestination, type GrowthDb } from "./db.js";
import { emptyCopy } from "./copy.js";
import { KITCHEN_CHANNEL_ID, REELMINO_CHANNEL_ID } from "./shortsSchedule.js";
import {
  advanceZernioCrossPosts,
  duePlatforms,
  parseZernioAccounts,
  preferredKind,
  selectZernioShort,
  summarizeZernioAnalytics,
  zernioCaption,
  zernioIdempotencyKey,
  zernioPostBody,
  type ZernioCandidate,
  type ZernioClient
} from "./zernio.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  delete process.env.ZERNIO_API_KEY;
  delete process.env.ZERNIO_ACCOUNTS;
  delete process.env.ZERNIO_DAILY_CAP;
  delete process.env.ZERNIO_SLOT_PREFER;
});

function db(): { db: GrowthDb; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "zernio-"));
  dirs.push(dir);
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return { db: opened, dir };
}

function candidate(jobId: string, kind: "kitchen" | "product", slotIndex: number, publishAt: string): ZernioCandidate {
  return { jobId, kind, slotIndex, publishAt: new Date(publishAt) };
}

describe("zernio cross-post", () => {
  it("builds a caption with two or three hashtags and keeps X inside 280 characters", () => {
    const url = "https://www.youtube.com/channel/UCsKPN8oZJOPM4KJC4bN_ANw";
    const caption = zernioCaption({ title: "Keep herbs alive", hashtags: ["herbs", "storage", "fridge", "shorts"], channelUrl: url });
    expect(caption.startsWith("Keep herbs alive\n")).toBe(true);
    expect(caption).toContain("#herbs #storage #fridge");
    expect(caption).toContain(`More on YouTube: ${url}`);
    expect(caption.match(/#/g)?.length).toBe(3);
    const tweet = zernioCaption({
      title: "A".repeat(240),
      hashtags: ["herbs", "storage", "fridge"],
      channelUrl: url,
      maxLength: 280
    });
    expect(tweet.length).toBeLessThanOrEqual(280);
    expect(tweet).toContain(`More on YouTube: ${url}`);
    expect(tweet.match(/#/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("prefers kitchen on even slots and product on odd slots, and stops at the daily cap", () => {
    expect(parseZernioAccounts("").map((item) => item.platform)).toEqual(["tiktok", "twitter"]);
    expect(parseZernioAccounts("x:abc,tiktok:def")[0]).toEqual({ platform: "twitter", accountId: "abc" });
    expect(preferredKind(0)).toBe("kitchen");
    expect(preferredKind(1)).toBe("product");
    const now = new Date("2026-11-17T21:30:00.000Z");
    const ready = [
      candidate("kitchen-even", "kitchen", 0, "2026-11-17T13:00:00.000Z"),
      candidate("product-even", "product", 0, "2026-11-17T14:00:00.000Z"),
      candidate("kitchen-odd", "kitchen", 1, "2026-11-17T17:00:00.000Z"),
      candidate("product-odd", "product", 1, "2026-11-17T19:00:00.000Z")
    ];
    expect(selectZernioShort({ now, cap: 3, minGapMs: 2 * 60 * 60 * 1000, postedToday: 0, lastPostedAt: null, candidates: ready })?.jobId).toBe("kitchen-even");
    expect(selectZernioShort({
      now,
      cap: 3,
      minGapMs: 2 * 60 * 60 * 1000,
      postedToday: 1,
      lastPostedAt: new Date("2026-11-17T13:00:00.000Z"),
      candidates: ready.filter((item) => item.jobId !== "kitchen-even")
    })?.jobId).toBe("product-odd");
    expect(selectZernioShort({ now, cap: 3, minGapMs: 2 * 60 * 60 * 1000, postedToday: 3, lastPostedAt: null, candidates: ready })).toBeNull();
    expect(selectZernioShort({
      now,
      cap: 3,
      minGapMs: 2 * 60 * 60 * 1000,
      postedToday: 1,
      lastPostedAt: new Date("2026-11-17T21:00:00.000Z"),
      candidates: ready
    })).toBeNull();
    expect(selectZernioShort({
      now: new Date("2026-11-17T14:30:00.000Z"),
      cap: 3,
      minGapMs: 2 * 60 * 60 * 1000,
      postedToday: 0,
      lastPostedAt: null,
      candidates: [candidate("product-even", "product", 0, "2026-11-17T14:00:00.000Z"), candidate("product-odd", "product", 1, "2026-11-17T19:00:00.000Z")]
    })).toBeNull();
  });

  it("posts each platform once and stores the post id", async () => {
    process.env.ZERNIO_ACCOUNTS = "tiktok:6afd5d11e23b7dac9dfd7e84,x:6afd5d2a030baa4c27c55943";
    process.env.ZERNIO_DAILY_CAP = "3";
    const opened = db();
    seedShort(opened, { jobId: "job-1", slot: "15:00", kind: "kitchen", publishAt: "2026-11-17T13:00:00.000Z" });
    const calls: string[] = [];
    const client = fakeClient(calls);
    const now = new Date("2026-11-17T13:05:00.000Z");
    await advanceZernioCrossPosts(opened.db, { now, mediaDir: opened.dir, log: () => undefined, client });
    await advanceZernioCrossPosts(opened.db, { now: new Date(now.getTime() + 60_000), mediaDir: opened.dir, log: () => undefined, client });
    expect(calls).toEqual(["tiktok", "twitter"]);
    const rows = opened.db.prepare("SELECT network, status, detail FROM growth_crossposts ORDER BY network").all() as Array<{ network: string; status: string; detail: string }>;
    expect(rows).toEqual([
      { network: "zernio:tiktok", status: "posted", detail: "post-tiktok" },
      { network: "zernio:twitter", status: "posted", detail: "post-twitter" }
    ]);
    expect(zernioIdempotencyKey("job-1", "tiktok")).toBe(zernioIdempotencyKey("job-1", "tiktok"));
    expect(duePlatforms(parseZernioAccounts(), rows.map((row) => ({ ...row, jobId: "job-1", createdAt: now.toISOString() })), now)).toEqual([]);
    expect(zernioPostBody({ content: "hi", mediaUrl: "https://media.example/a.mp4", platform: "tiktok", accountId: "acc" }).tiktokSettings).toBeTruthy();
  });

  it("retries a failed platform later and does not post before the YouTube slot", async () => {
    process.env.ZERNIO_ACCOUNTS = "tiktok:6afd5d11e23b7dac9dfd7e84,x:6afd5d2a030baa4c27c55943";
    process.env.ZERNIO_DAILY_CAP = "3";
    const opened = db();
    seedShort(opened, { jobId: "job-2", slot: "15:00", kind: "kitchen", publishAt: "2026-11-17T13:00:00.000Z" });
    seedShort(opened, { jobId: "job-future", slot: "19:00", kind: "kitchen", publishAt: "2026-11-17T17:00:00.000Z", channel: "kitchen" });
    const calls: string[] = [];
    let failTwitter = true;
    const client: ZernioClient = {
      upload: async () => "https://media.zernio.com/temp/clip.mp4",
      publish: async (input) => {
        if (input.platform === "twitter" && failTwitter) throw new Error("x down");
        calls.push(`${input.jobId}:${input.platform}`);
        return { postId: `post-${input.platform}` };
      }
    };
    const now = new Date("2026-11-17T13:05:00.000Z");
    await advanceZernioCrossPosts(opened.db, { now, mediaDir: opened.dir, log: () => undefined, client });
    expect(calls).toEqual(["job-2:tiktok"]);
    await advanceZernioCrossPosts(opened.db, { now: new Date(now.getTime() + 60_000), mediaDir: opened.dir, log: () => undefined, client });
    expect(calls).toEqual(["job-2:tiktok"]);
    failTwitter = false;
    await advanceZernioCrossPosts(opened.db, { now: new Date(now.getTime() + 3 * 60 * 1000), mediaDir: opened.dir, log: () => undefined, client });
    expect(calls).toEqual(["job-2:tiktok", "job-2:twitter"]);
    const twitter = opened.db.prepare("SELECT detail FROM growth_crossposts WHERE job_id = ? AND network = ?").get("job-2", "zernio:twitter") as { detail: string };
    expect(twitter.detail).toBe("post-twitter");
    const future = opened.db.prepare("SELECT COUNT(*) AS n FROM growth_crossposts WHERE job_id = ?").get("job-future") as { n: number };
    expect(future.n).toBe(0);
    expect(summarizeZernioAnalytics({ posts: [{ platform: "tiktok", analytics: { views: 10, likes: 2 } }, { platform: "twitter", analytics: { views: 4, likes: 1 } }] })).toContain("tiktok posts=1 views=10");
  });
});

function fakeClient(calls: string[]): ZernioClient {
  return {
    upload: async () => "https://media.zernio.com/temp/clip.mp4",
    publish: async (input) => {
      calls.push(input.platform);
      return { postId: `post-${input.platform}` };
    }
  };
}

function seedShort(
  opened: { db: GrowthDb; dir: string },
  input: { jobId: string; slot: string; kind: "kitchen" | "product"; publishAt: string; channel?: "kitchen" }
): void {
  const kitchen = input.kind === "kitchen";
  const destinationId = kitchen ? "kitchen" : "product";
  upsertDestination(opened.db, {
    id: destinationId,
    connectionId: kitchen ? "conn-k" : "conn-p",
    network: "youtube",
    kind: "channel",
    externalId: kitchen ? KITCHEN_CHANNEL_ID : REELMINO_CHANNEL_ID,
    name: kitchen ? "Kitchen Tips" : "Reelmino",
    handle: kitchen ? "@KitchenTips-Reelmino" : "@reelminoapp",
    url: kitchen ? "https://www.youtube.com/channel/UCsKPN8oZJOPM4KJC4bN_ANw" : "https://www.youtube.com/channel/UC3iee8PYICmnfO5s8viJgkQ",
    config: {}
  });
  const copy = emptyCopy();
  copy.hashtags = ["herbs", "storage"];
  const item = insertItem(opened.db, {
    id: `item-${input.jobId}`,
    slug: `slug-${input.jobId}`,
    source: "shorts-schedule",
    title: kitchen ? "Keep herbs alive" : "One sentence bakery ad",
    summary: "short",
    language: "en",
    copy,
    mediaPath: `${input.jobId}.mp4`,
    mediaMime: "video/mp4",
    mediaKind: "video",
    mediaWidth: 1080,
    mediaHeight: 1920,
    mediaDurationMs: 20_000,
    reelminoRunId: null
  });
  writeFileSync(path.join(opened.dir, `${input.jobId}.mp4`), "mp4");
  insertJob(opened.db, { id: input.jobId, itemId: item.id, destinationId, slotId: null, network: "youtube", status: "published" });
  const channelId = kitchen ? KITCHEN_CHANNEL_ID : REELMINO_CHANNEL_ID;
  const now = "2026-11-17T13:00:00.000Z";
  opened.db.prepare(
    `INSERT INTO shorts_slots (slot_key, destination_id, publish_at, status, attempts, title, item_id, run_id, job_id, error, created_at, updated_at)
     VALUES (?, ?, ?, 'published', 1, ?, ?, NULL, ?, NULL, ?, ?)`
  ).run(`shorts:${channelId}:2026-11-17:${input.slot}`, destinationId, input.publishAt, item.title, item.id, input.jobId, now, now);
}
