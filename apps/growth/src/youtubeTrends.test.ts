import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCopy } from "./copy.js";
import { listTrendCycles, openDb, upsertDestination, type GrowthDb } from "./db.js";
import { publishCopy } from "./publish.js";
import { buildApp } from "./server.js";
import {
  applyTrendSettings,
  attentionScore,
  advanceYoutubeTrends,
  contentForTrend,
  learnTaste,
  pickTopic,
  tokens,
  topicLabel,
  trendSlotKey,
  videosFromApi,
  type TrendVideo
} from "./youtubeTrends.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "trends-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function db(): { db: GrowthDb; dir: string } {
  const dir = tempDir();
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return { db: opened, dir };
}

function video(patch: Partial<TrendVideo> & Pick<TrendVideo, "videoId" | "title">): TrendVideo {
  return {
    channelTitle: "ערוץ אחר",
    viewCount: 10_000,
    likeCount: 100,
    commentCount: 10,
    publishedAt: new Date().toISOString(),
    categoryId: "22",
    source: "chart",
    ...patch
  };
}

describe("youtube trend loop", () => {
  it("ranks fresh attention above an old quiet video", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    const hot = attentionScore(video({ videoId: "hot", title: "נושא חם מאוד", viewCount: 2_000_000, likeCount: 80_000, commentCount: 9_000, publishedAt: new Date(now - 3_600_000).toISOString() }), now);
    const cold = attentionScore(video({ videoId: "cold", title: "נושא ישן", viewCount: 1_000, likeCount: 10, commentCount: 1, publishedAt: new Date(now - 400 * 86_400_000).toISOString() }), now);
    expect(hot).toBeGreaterThan(cold);
  });

  it("learns words from the channel videos people already watch", () => {
    const taste = learnTaste([
      video({ videoId: "own-win", title: "עריכת סרטונים לעסק", viewCount: 80_000, likeCount: 4_000, commentCount: 300, source: "channel" }),
      video({ videoId: "own-quiet", title: "מתכון עוגה מהירה", viewCount: 20, likeCount: 0, commentCount: 0, source: "channel" })
    ]);
    expect(taste.get("עריכת") ?? 0).toBeGreaterThan(taste.get("עוגה") ?? 0);
  });

  it("picks an on-niche topic and skips one the channel already covered", () => {
    const business = video({ videoId: "biz", title: "איך עסקים קטנים מכינים סרטון בלי צוות", viewCount: 1_000_000, likeCount: 40_000, commentCount: 3_000 });
    const music = video({ videoId: "music", title: "Official Music Video Song", viewCount: 9_000_000, likeCount: 100_000, commentCount: 5_000, categoryId: "10" });
    const picked = pickTopic({
      chart: [music, business],
      taste: new Map([["עסקים", 2], ["סרטון", 2]]),
      recentTokens: [],
      recentVideoIds: [],
      niche: "עסקים סרטון",
      ownChannel: "Reelmino"
    });
    expect(picked?.videoId).toBe("biz");
    expect(picked?.topic).not.toBe(business.title);
    expect(picked?.inspirationTitle).toBe(business.title);
    expect(pickTopic({
      chart: [business],
      taste: new Map(),
      recentTokens: [tokens(business.title)],
      recentVideoIds: [],
      niche: ""
    })).toBeNull();
  });

  it("builds an original brief instead of copying the trending title", () => {
    const raw = "The secret trick everyone is using right now!!!";
    const label = topicLabel(raw);
    expect(label).not.toContain("!");
    expect(label.toLowerCase().startsWith("the ")).toBe(false);
    const content = contentForTrend({ topic: label, niche: "small business video", language: "he" });
    expect(content.brief.aspectRatio).toBe("9:16");
    expect(content.brief.approvalMode).toBe("auto");
    expect(content.brief.durationSeconds).toBe(30);
    expect(String(content.brief.instructions)).toContain("מקורי");
    expect(String(content.brief.instructions)).toContain("בעברית בלבד");
    expect(content.title).not.toMatch(/[A-Za-z]/);
    expect(content.description.replaceAll("#Shorts", "")).not.toMatch(/[A-Za-z]/);
    expect(JSON.stringify(content)).not.toContain(raw);
    expect(content.description).toContain("#Shorts");
  });

  it("keeps the same slot for four hours and changes on the next window", () => {
    const start = Date.parse("2026-10-27T00:00:00Z");
    const span = 4 * 60 * 60 * 1000;
    const boundary = Math.floor(start / span) * span + 1_000;
    expect(trendSlotKey(new Date(boundary), 4)).toBe(trendSlotKey(new Date(boundary + 3 * 60 * 60 * 1000), 4));
    expect(trendSlotKey(new Date(boundary), 4)).not.toBe(trendSlotKey(new Date(boundary + 4 * 60 * 60 * 1000), 4));
  });

  it("reads public chart rows and ignores entries without a title", () => {
    const rows = videosFromApi({
      items: [
        { id: "a", snippet: { title: "נושא", channelTitle: "ערוץ", publishedAt: "2026-10-27T00:00:00Z", categoryId: "22" }, statistics: { viewCount: "12", likeCount: "1", commentCount: "0" } },
        { id: "b", snippet: { title: "  " } }
      ]
    }, "chart");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ videoId: "a", viewCount: 12, source: "chart" });
  });

  it("stays idle until the loop is enabled", async () => {
    const opened = db();
    let called = false;
    await advanceYoutubeTrends(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      { client: { mostPopular: async () => { called = true; return []; }, channelVideos: async () => [] } }
    );
    expect(called).toBe(false);
    expect(listTrendCycles(opened.db)).toHaveLength(0);
  });

  it("submits one original brief per slot, then uploads the finished video", async () => {
    const opened = db();
    upsertDestination(opened.db, {
      id: "dest-yt",
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: "UC123",
      name: "Reelmino",
      handle: "@reelmino",
      url: "https://www.youtube.com/channel/UC123",
      config: {}
    });
    expect(applyTrendSettings(opened.db, { enabled: true, hours: 4, region: "IL", language: "he", niche: "עסקים סרטון", destinationId: "dest-yt" })).toBeNull();
    expect(applyTrendSettings(opened.db, { hours: 3 })).toContain("מרווח");
    const briefs: Record<string, unknown>[] = [];
    let ready = false;
    let published = 0;
    const deps = {
      now: new Date("2026-10-27T12:00:00Z"),
      pollAfterMs: 0,
      client: {
        mostPopular: async () => [video({ videoId: "biz", title: "איך עסקים קטנים מכינים סרטון בלי צוות", viewCount: 1_000_000, likeCount: 40_000, commentCount: 3_000 })],
        channelVideos: async () => [video({ videoId: "own", title: "סרטון לעסק קטן", viewCount: 20_000, source: "channel", channelTitle: "Reelmino" })]
      },
      submitBrief: async (brief: Record<string, unknown>) => {
        briefs.push(brief);
        return "run-1";
      },
      downloadFinal: async () => (ready ? { filename: "ready.mp4" } : null),
      publish: async () => {
        published += 1;
        return { id: "job-1", status: "published", remoteUrl: "https://youtu.be/ready" };
      }
    };
    const ctx = { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" };
    await advanceYoutubeTrends(ctx, deps);
    expect(briefs).toHaveLength(1);
    expect(JSON.stringify(briefs[0])).not.toContain("ערוץ אחר");
    expect(String(briefs[0]?.sourceText)).toContain("מקורי");
    expect(listTrendCycles(opened.db)[0]?.status).toBe("producing");
    await advanceYoutubeTrends(ctx, deps);
    expect(published).toBe(0);
    expect(listTrendCycles(opened.db)[0]?.status).toBe("producing");
    ready = true;
    await advanceYoutubeTrends(ctx, deps);
    expect(published).toBe(1);
    expect(listTrendCycles(opened.db)[0]).toMatchObject({ status: "published", remoteUrl: "https://youtu.be/ready" });
    await advanceYoutubeTrends(ctx, deps);
    expect(briefs).toHaveLength(1);
  });

  it("keeps the trend caption on YouTube instead of a promo frame", () => {
    const copy = publishCopy({
      id: "i1",
      slug: "trend-1",
      source: "youtube-trend",
      title: "נושא חם — מה כדאי לדעת",
      summary: "הסבר",
      language: "he",
      copy: { ...emptyCopy(), youtube: { title: "נושא חם — מה כדאי לדעת", body: "הסבר מקורי\n\n#Shorts" } },
      mediaPath: null,
      mediaMime: null,
      mediaKind: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationMs: null,
      reelminoRunId: null,
      createdAt: "2026-10-27T00:00:00Z",
      updatedAt: "2026-10-27T00:00:00Z"
    }, "youtube");
    expect(copy.title).toBe("נושא חם — מה כדאי לדעת");
    expect(copy.body).toContain("הסבר מקורי");
    expect(copy.body).not.toContain("clip toy");
  });

  it("exposes the trend controls on the console", async () => {
    process.env.GROWTH_OPERATOR_PASSWORD = "secret";
    process.env.GROWTH_DISABLE_SCHEDULER = "1";
    const dir = tempDir();
    const built = await buildApp({
      dataDir: dir,
      webPublic: path.join(dir, "public"),
      promoKit: path.join(dir, "missing-kit"),
      listen: false
    });
    try {
      const page = await built.app.inject({ method: "GET", url: "/" });
      expect(page.body).toContain("מגמות");
      const script = await built.app.inject({ method: "GET", url: "/app.js" });
      expect(script.body).toContain("renderTrends");
      const login = await built.app.inject({ method: "POST", url: "/api/login", payload: { password: "secret" } });
      const setCookie = login.headers["set-cookie"];
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(";")[0]!;
      const saved = await built.app.inject({
        method: "PATCH",
        url: "/api/youtube-trends",
        headers: { cookie },
        payload: { enabled: true, hours: 4, region: "us", language: "HE", niche: "שיווק", destinationId: null }
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ enabled: true, region: "US", language: "he", niche: "שיווק" });
      const rejected = await built.app.inject({
        method: "PATCH",
        url: "/api/youtube-trends",
        headers: { cookie },
        payload: { hours: 5 }
      });
      expect(rejected.statusCode).toBe(400);
      const started = await built.app.inject({ method: "POST", url: "/api/youtube-trends/run", headers: { cookie }, payload: {} });
      expect(started.statusCode).toBe(200);
      expect(started.json()).toMatchObject({ status: "failed" });
      expect(String(started.json().error)).toContain("יוטיוב");
    } finally {
      await built.close();
    }
  });
});
