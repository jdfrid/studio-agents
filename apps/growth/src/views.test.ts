import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCopy } from "./copy.js";
import { insertItem, insertJob, openDb, updateJob, upsertDestination, type GrowthDb } from "./db.js";
import { KITCHEN_CHANNEL_ID, REELMINO_CHANNEL_ID } from "./shortsSchedule.js";
import { buildApp } from "./server.js";
import {
  advanceViewStats,
  applyTelegramViews,
  applyTikTokViews,
  collectTikTokPosts,
  fetchYoutubeUploadStats,
  knownSum,
  loadTelegramViews,
  parseTelegramViews,
  parseYoutubeDump,
  viewsReport,
  type FetchLike
} from "./views.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

afterEach(() => {
  while (dbs.length) dbs.pop()?.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  delete process.env.ZERNIO_API_KEY;
  delete process.env.GROWTH_OPERATOR_PASSWORD;
  delete process.env.TGRELAY_VIEWS_FILE;
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "views-"));
  dirs.push(dir);
  return dir;
}

function db(): GrowthDb {
  const opened = openDb(path.join(tempDir(), "growth.sqlite"));
  dbs.push(opened);
  return opened;
}

function jsonResponse(body: unknown, status = 200): Awaited<ReturnType<FetchLike>> {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("views dashboard", () => {
  it("keeps a real zero and leaves a missing count empty", () => {
    expect(knownSum([null, null])).toBeNull();
    expect(knownSum([0, null, 4])).toBe(4);
    const dump = parseYoutubeDump({
      fetchedAt: "2026-11-20T00:00:00.000Z",
      channels: {
        [KITCHEN_CHANNEL_ID]: {
          videos: [
            { id: "kitchentip1", title: "טיפ", publishedAt: "2026-11-01T00:00:00.000Z", viewCount: 8 },
            { id: "kitchentip2", title: "בלי מספר" },
            { id: "bad", viewCount: 99 }
          ]
        }
      },
      videos: [{ id: "reelminovid", views: 3 }]
    });
    expect(dump.updatedAt).toBe("2026-11-20T00:00:00.000Z");
    expect(dump.videos).toEqual([
      {
        videoId: "kitchentip1",
        channelId: KITCHEN_CHANNEL_ID,
        title: "טיפ",
        publishedAt: "2026-11-01T00:00:00.000Z",
        views: 8
      }
    ]);
  });

  it("reads every uploads page and does not turn a missing statistic into zero", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url: string) => {
      calls.push(url);
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/channels")) {
        const id = parsed.searchParams.get("id") ?? "";
        return jsonResponse({ items: [{ contentDetails: { relatedPlaylists: { uploads: `UU${id}` } } }] });
      }
      if (parsed.pathname.endsWith("/playlistItems")) {
        const channelId = (parsed.searchParams.get("playlistId") ?? "").slice(2);
        const kitchen = channelId === KITCHEN_CHANNEL_ID;
        if (!parsed.searchParams.get("pageToken")) {
          return jsonResponse({
            nextPageToken: "next",
            items: [
              {
                snippet: { title: "First", publishedAt: "2026-11-01T10:00:00.000Z", resourceId: { videoId: kitchen ? "kitchentip1" : "reelminovid" } },
                contentDetails: { videoPublishedAt: "2026-11-01T10:00:00.000Z" }
              }
            ]
          });
        }
        return jsonResponse({
          items: [
            {
              snippet: { title: "Second", resourceId: { videoId: kitchen ? "kitchentip2" : "reelminovi2" } },
              contentDetails: { videoPublishedAt: "2026-11-02T10:00:00.000Z" }
            }
          ]
        });
      }
      const ids = (parsed.searchParams.get("id") ?? "").split(",").filter(Boolean);
      return jsonResponse({
        items: ids.map((id) => ({
          id,
          snippet: { title: `Title ${id}`, publishedAt: "2026-11-01T10:00:00.000Z" },
          ...(id.endsWith("2") ? {} : { statistics: { viewCount: id === "kitchentip1" ? "15" : "0" } })
        }))
      });
    };
    const kitchen = await fetchYoutubeUploadStats("token", KITCHEN_CHANNEL_ID, fetchImpl);
    expect(kitchen.map((video) => [video.videoId, video.views])).toEqual([
      ["kitchentip1", 15],
      ["kitchentip2", null]
    ]);
    expect(calls.some((url) => url.includes("pageToken=next"))).toBe(true);
    const product = await fetchYoutubeUploadStats("token", REELMINO_CHANNEL_ID, fetchImpl);
    expect(product.find((video) => video.videoId === "reelminovid")?.views).toBe(0);
    expect(product.find((video) => video.videoId === "reelminovi2")?.views).toBeNull();
  });

  it("maps TikTok analytics through cross-posts and ignores X", () => {
    const opened = db();
    seedVideo(opened, { jobId: "job-1", videoId: "kitchentip1", channelId: KITCHEN_CHANNEL_ID, title: "טיפ למטבח" });
    seedVideo(opened, { jobId: "job-2", videoId: "reelminovid", channelId: REELMINO_CHANNEL_ID, title: "Reelmino" });
    opened.prepare("INSERT INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, 'zernio:tiktok', 'posted', ?, ?)").run("job-1", "post-1", "2026-11-01T00:00:00.000Z");
    opened.prepare("INSERT INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, 'zernio:tiktok', 'posted', ?, ?)").run("job-2", "post-blank", "2026-11-01T00:00:00.000Z");
    opened.prepare("INSERT INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, 'zernio:twitter', 'posted', ?, ?)").run("job-1", "post-x", "2026-11-01T00:00:00.000Z");
    const totals = applyTikTokViews(opened, [
      { postId: "post-1", platform: "tiktok", views: 9 },
      { postId: "post-x", platform: "twitter", views: 100 },
      { postId: "post-loose", platform: "tiktok", views: 4 },
      { postId: "post-blank", platform: "tiktok", views: null },
      { postId: "post-zero", platform: "tiktok", views: 0 }
    ], new Date("2026-11-23T08:00:00.000Z"));
    expect(totals).toEqual({ views: 13, unmapped: 4 });
    const report = viewsReport(opened);
    expect(report.videos.find((video) => video.videoId === "kitchentip1")).toMatchObject({ tiktok: 9, youtube: null, total: 9 });
    const blank = opened.prepare("SELECT tiktok_views FROM view_videos WHERE video_id = ?").get("reelminovid") as { tiktok_views?: number | null } | undefined;
    expect(blank?.tiktok_views ?? null).toBeNull();
    expect(report.networks.find((network) => network.id === "x")).toEqual({ id: "x", label: "X", views: null, paused: true, unmapped: 0 });
    expect(report.networks.find((network) => network.id === "tiktok")?.views).toBe(13);
  });

  it("reads channel posts and leaves group views empty unless the file has them", () => {
    const parsed = parseTelegramViews({
      fetched_at: "2026-11-23T06:00:00.000Z",
      channel: {
        posts: [
          { message_id: 10, views: 7, text: "https://youtu.be/kitchentip1" },
          { id: 11, view_count: 3, youtubeId: "reelminovid" },
          { message_id: 99, views: 1, text: "בלי קישור" }
        ]
      },
      groups: [
        { id: "-1001", title: "קבוצת מטבח", members: 40, posts: 3 },
        { name: "רילמינו", member_count: 8, messages: [1, 2], views: 2 }
      ]
    });
    expect(parsed.recognized).toBe(true);
    expect(parsed.groups.map((group) => [group.name, group.members, group.posts, group.views])).toEqual([
      ["קבוצת מטבח", 40, 3, null],
      ["רילמינו", 8, 2, 2]
    ]);
    const opened = db();
    seedVideo(opened, { jobId: "job-1", videoId: "kitchentip1", channelId: KITCHEN_CHANNEL_ID, title: "טיפ" });
    opened.prepare("INSERT INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, 'telegram:-1004473673094', 'posted', ?, ?)").run("job-1", "10", "2026-11-01T00:00:00.000Z");
    const applied = applyTelegramViews(opened, parsed, new Date("2026-11-23T08:00:00.000Z"));
    expect(applied).toEqual({ views: 11, unmapped: 1 });
    const report = viewsReport(opened);
    expect(report.videos.find((video) => video.videoId === "kitchentip1")?.telegram).toBe(7);
    expect(report.videos.find((video) => video.videoId === "reelminovid")?.telegram).toBe(3);
    expect(report.groups.find((group) => group.name === "קבוצת מטבח")?.views).toBeNull();
    expect(report.groups.find((group) => group.name === "רילמינו")?.views).toBe(2);
    expect(loadTelegramViews(path.join(tempDir(), "missing.json")).status).toBe("missing");
    const bad = path.join(tempDir(), "views.json");
    writeFileSync(bad, "{");
    expect(loadTelegramViews(bad).status).toBe("invalid");
    writeFileSync(bad, JSON.stringify({ hello: 1 }));
    expect(loadTelegramViews(bad).status).toBe("unrecognized");
    expect(viewsReport(opened).groups).toHaveLength(2);
  });

  it("matches a Telegram message only inside its chat and clears an empty post snapshot", () => {
    const opened = db();
    seedVideo(opened, { jobId: "job-a", videoId: "kitchentip1", channelId: KITCHEN_CHANNEL_ID, title: "ערוץ א" });
    seedVideo(opened, { jobId: "job-b", videoId: "reelminovid", channelId: REELMINO_CHANNEL_ID, title: "ערוץ ב" });
    const stamp = "2026-11-01T00:00:00.000Z";
    opened.prepare("INSERT INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, 'telegram:-1001', 'posted', '10', ?)").run("job-a", stamp);
    opened.prepare("INSERT INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, 'telegram:-1002', 'posted', '10', ?)").run("job-b", stamp);
    const scoped = parseTelegramViews({
      channel: { id: "-1002", posts: [{ message_id: 10, views: 5 }] },
      posts: [{ message_id: 10, views: 9 }, { message_id: 10, views: 4, youtubeId: "kitchentip1" }]
    });
    expect(scoped.posts.find((post) => post.views === 5)?.chatId).toBe("-1002");
    const applied = applyTelegramViews(opened, scoped, new Date("2026-11-23T08:00:00.000Z"));
    expect(viewsReport(opened).videos.find((video) => video.videoId === "reelminovid")?.telegram).toBe(5);
    expect(viewsReport(opened).videos.find((video) => video.videoId === "kitchentip1")?.telegram).toBe(4);
    expect(applied.unmapped).toBe(9);
    applyTelegramViews(opened, parseTelegramViews({ posts: [{ message_id: 10, text: "בלי צפיות" }] }), new Date("2026-11-23T09:00:00.000Z"));
    expect(viewsReport(opened).videos.find((video) => video.videoId === "reelminovid")?.telegram).toBe(5);
    applyTelegramViews(opened, parseTelegramViews({ posts: [] }), new Date("2026-11-23T10:00:00.000Z"));
    const cleared = viewsReport(opened);
    expect(cleared.videos.find((video) => video.videoId === "reelminovid")?.telegram).toBeNull();
    expect(cleared.videos.find((video) => video.videoId === "kitchentip1")?.telegram).toBeNull();
    expect(cleared.networks.find((network) => network.id === "telegram")?.views).toBeNull();
  });

  it("stores a snapshot from real counts and carries the last count forward", async () => {
    const opened = db();
    connectChannels(opened);
    seedVideo(opened, { jobId: "job-1", videoId: "kitchentip1", channelId: KITCHEN_CHANNEL_ID, title: "טיפ למטבח" });
    opened.prepare("INSERT INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, 'zernio:tiktok', 'posted', ?, ?)").run("job-1", "post-1", "2026-11-01T00:00:00.000Z");
    const dir = tempDir();
    const telegramFile = path.join(dir, "views.json");
    writeFileSync(telegramFile, JSON.stringify({
      updatedAt: "2026-11-23T06:00:00.000Z",
      posts: [{ messageId: "10", views: 7, text: "https://www.youtube.com/watch?v=kitchentip1" }],
      groups: [{ name: "קבוצת מטבח", members: 12, posts_sent: 2 }]
    }));
    opened.prepare("INSERT INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, 'telegram:-100', 'posted', '10', ?)").run("job-1", "2026-11-01T00:00:00.000Z");
    let youtubeCalls = 0;
    delete process.env.ZERNIO_API_KEY;
    const now = new Date("2026-11-23T09:00:00.000Z");
    const shared = {
      db: opened,
      tokenFor: async () => "token",
      fetchImpl: youtubeFetch(() => { youtubeCalls += 1; }),
      telegramFile,
      youtubeDumpFile: path.join(dir, "missing-dump.json"),
      log: () => undefined
    };
    await advanceViewStats({ ...shared, now });
    const first = viewsReport(opened);
    expect(first.channels).toEqual([
      { id: KITCHEN_CHANNEL_ID, name: "Kitchen Tips", views: 15 },
      { id: REELMINO_CHANNEL_ID, name: "Reelmino", views: 0 }
    ]);
    expect(first.networks.map((network) => [network.id, network.views, network.paused])).toEqual([
      ["youtube", 15, false],
      ["tiktok", null, false],
      ["telegram", 7, false],
      ["x", null, true]
    ]);
    const video = first.videos.find((row) => row.videoId === "kitchentip1");
    expect(video).toMatchObject({ youtube: 15, tiktok: null, telegram: 7, total: 22, channelName: "Kitchen Tips" });
    expect(first.videos.find((row) => row.videoId === "kitchentip2")).toMatchObject({ youtube: null, tiktok: null, telegram: null, total: null });
    expect(first.series.map((point) => point.views)).toEqual([22]);
    expect(first.sources.telegram).toBe("2026-11-23T06:00:00.000Z");
    expect(first.updatedAt).toBe(now.toISOString());
    const callsAfterFirst = youtubeCalls;
    await advanceViewStats({
      ...shared,
      now: new Date(now.getTime() + 60 * 60 * 1000),
      tiktokPage: async () => ({
        posts: [
          { _id: "post-1", platform: "tiktok", analytics: { views: 9 } },
          { _id: "post-loose", platform: "tiktok", analytics: { views: 4 } },
          { _id: "post-x", platform: "twitter", analytics: { views: 50 } }
        ],
        pagination: { pages: 1 }
      })
    });
    expect(youtubeCalls).toBe(callsAfterFirst);
    const second = viewsReport(opened);
    expect(second.networks.find((network) => network.id === "youtube")?.views).toBe(15);
    expect(second.networks.find((network) => network.id === "tiktok")?.views).toBe(13);
    expect(second.networks.find((network) => network.id === "x")?.views).toBeNull();
    expect(second.videos.find((row) => row.videoId === "kitchentip1")?.total).toBe(31);
    expect(second.series.map((point) => point.views)).toEqual([22, 35]);
  });

  it("pages TikTok analytics and uses a YouTube dump only when the API did not answer", async () => {
    const pages: number[] = [];
    const posts = await collectTikTokPosts(async (page) => {
      pages.push(page);
      if (page === 1) {
        return {
          posts: Array.from({ length: 50 }, (_, index) => ({ _id: `p${index}`, platform: "tiktok", analytics: { views: 1 } })),
          pagination: { pages: 2 }
        };
      }
      return { posts: [{ _id: "p-last", platform: "tiktok", analytics: { views: 2 } }, { _id: "p0", platform: "twitter", analytics: { views: 9 } }], pagination: { pages: 2 } };
    });
    expect(pages).toEqual([1, 2]);
    expect(posts).toHaveLength(51);
    expect(posts.some((post) => post.platform === "twitter")).toBe(false);
    const continued: number[] = [];
    const rest = await collectTikTokPosts(async (page) => {
      continued.push(page);
      if (page === 1) return { posts: Array.from({ length: 50 }, (_, index) => ({ _id: `q${index}`, platform: "tiktok", analytics: { views: 1 } })) };
      return { posts: [{ _id: "q-tail", platform: "tiktok", analytics: { views: 3 } }] };
    });
    expect(continued).toEqual([1, 2]);
    expect(rest).toHaveLength(51);

    const opened = db();
    const dir = tempDir();
    const dumpFile = path.join(dir, "youtube_views_dump.json");
    writeFileSync(dumpFile, JSON.stringify({
      updatedAt: "2026-11-22T00:00:00.000Z",
      channels: [{ id: KITCHEN_CHANNEL_ID, videos: [{ videoId: "kitchentip1", title: "מהדמפ", viewCount: "8" }] }]
    }));
    await advanceViewStats({
      db: opened,
      now: new Date("2026-11-23T09:00:00.000Z"),
      youtubeDumpFile: dumpFile,
      telegramFile: path.join(dir, "no-telegram.json"),
      log: () => undefined
    });
    const report = viewsReport(opened);
    expect(report.channels.find((channel) => channel.id === KITCHEN_CHANNEL_ID)?.views).toBe(8);
    expect(report.channels.find((channel) => channel.id === REELMINO_CHANNEL_ID)?.views).toBeNull();
    expect(report.videos[0]).toMatchObject({ title: "מהדמפ", youtube: 8, tiktok: null, telegram: null, total: 8 });
    expect(report.sources.youtube).toBe("2026-11-22T00:00:00.000Z");
  });

  it("serves the Hebrew views page behind the operator login", async () => {
    process.env.GROWTH_OPERATOR_PASSWORD = "secret";
    process.env.GROWTH_DISABLE_SCHEDULER = "1";
    const dir = tempDir();
    const built = await buildApp({ dataDir: dir, webPublic: path.join(dir, "public"), promoKit: path.join(dir, "missing-kit"), listen: false });
    try {
      const page = await built.app.inject({ method: "GET", url: "/views" });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain("צפיות");
      expect(page.body).toContain('dir="rtl"');
      const script = await built.app.inject({ method: "GET", url: "/app.js" });
      expect(script.body).toContain("צפיות מצטברות");
      expect(script.body).toContain("מושהה");
      expect((await built.app.inject({ method: "GET", url: "/api/views" })).statusCode).toBe(401);
      const login = await built.app.inject({ method: "POST", url: "/api/login", payload: { password: "secret" } });
      const setCookie = login.headers["set-cookie"];
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(";")[0]!;
      const body = await built.app.inject({ method: "GET", url: "/api/views", headers: { cookie } });
      expect(body.statusCode).toBe(200);
      const report = JSON.parse(body.body) as { networks: Array<{ id: string; paused: boolean; views: number | null }>; channels: Array<{ name: string; views: number | null }>; videos: unknown[]; series: unknown[] };
      expect(report.networks.find((network) => network.id === "x")).toMatchObject({ paused: true, views: null });
      expect(report.channels.map((channel) => [channel.name, channel.views])).toEqual([
        ["Kitchen Tips", null],
        ["Reelmino", null]
      ]);
      expect(report.videos).toEqual([]);
      expect(report.series).toEqual([]);
    } finally {
      await built.close();
    }
  });
});

function connectChannels(opened: GrowthDb): void {
  for (const channel of [
    { id: "kitchen", externalId: KITCHEN_CHANNEL_ID, name: "Kitchen Tips" },
    { id: "product", externalId: REELMINO_CHANNEL_ID, name: "Reelmino" }
  ]) {
    upsertDestination(opened, {
      id: channel.id,
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: channel.externalId,
      name: channel.name,
      handle: channel.id === "kitchen" ? "@KitchenTips-Reelmino" : "@reelminoapp",
      url: `https://www.youtube.com/channel/${channel.externalId}`,
      config: {}
    });
  }
}

function seedVideo(opened: GrowthDb, input: { jobId: string; videoId: string; channelId: string; title: string }): void {
  const item = insertItem(opened, {
    id: `item-${input.jobId}`,
    slug: `slug-${input.jobId}`,
    source: "shorts-schedule",
    title: input.title,
    summary: "",
    language: "he",
    copy: emptyCopy(),
    mediaPath: null,
    mediaMime: null,
    mediaKind: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationMs: null,
    reelminoRunId: null
  });
  insertJob(opened, { id: input.jobId, itemId: item.id, destinationId: null, slotId: null, network: "youtube", status: "published" });
  updateJob(opened, input.jobId, {
    remotePostId: input.videoId,
    remoteUrl: `https://youtu.be/${input.videoId}`,
    publishedAt: "2026-11-01T10:00:00.000Z"
  });
  opened.prepare("UPDATE jobs SET destination_id = ? WHERE id = ?").run(input.channelId === KITCHEN_CHANNEL_ID ? "kitchen" : "product", input.jobId);
}

function youtubeFetch(onCall: () => void): FetchLike {
  return async (url: string) => {
    onCall();
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/channels")) {
      const id = parsed.searchParams.get("id") ?? "";
      return jsonResponse({ items: [{ contentDetails: { relatedPlaylists: { uploads: `UU${id}` } } }] });
    }
    if (parsed.pathname.endsWith("/playlistItems")) {
      const kitchen = (parsed.searchParams.get("playlistId") ?? "").includes(KITCHEN_CHANNEL_ID);
      if (!parsed.searchParams.get("pageToken")) {
        return jsonResponse({
          nextPageToken: "next",
          items: [{ snippet: { title: kitchen ? "טיפ" : "מוצר", resourceId: { videoId: kitchen ? "kitchentip1" : "reelminovid" } }, contentDetails: { videoPublishedAt: "2026-11-01T10:00:00.000Z" } }]
        });
      }
      return jsonResponse({
        items: [{ snippet: { title: "שני", resourceId: { videoId: kitchen ? "kitchentip2" : "reelminovi2" } }, contentDetails: { videoPublishedAt: "2026-11-02T10:00:00.000Z" } }]
      });
    }
    const ids = (parsed.searchParams.get("id") ?? "").split(",").filter(Boolean);
    return jsonResponse({
      items: ids.map((id) => ({
        id,
        snippet: { title: id === "kitchentip1" ? "טיפ למטבח" : `Title ${id}`, publishedAt: "2026-11-01T10:00:00.000Z" },
        ...(id.endsWith("2") ? {} : { statistics: { viewCount: id === "kitchentip1" ? "15" : "0" } })
      }))
    });
  };
}
