import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCopy } from "./copy.js";
import { insertItem, insertJob, openDb, upsertDestination, type GrowthDb } from "./db.js";
import { KITCHEN_CHANNEL_ID } from "./shortsSchedule.js";
import {
  advanceTelegramCrossPosts,
  parseTelegramChatIds,
  selectTelegramPost,
  telegramCrossCaption,
  telegramSendMode,
  TELEGRAM_VIDEO_LIMIT,
  type TelegramClient
} from "./telegramCrossPost.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];
const CHAT = "-1004473673094";

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_IDS;
});

function db(): { db: GrowthDb; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "telegram-cross-"));
  dirs.push(dir);
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return { db: opened, dir };
}

describe("telegram channel cross-post", () => {
  it("builds an English or Hebrew caption inside the Telegram limit", () => {
    expect(parseTelegramChatIds(" -1004473673094, @other , -1004473673094 ")).toEqual([CHAT, "@other"]);
    expect(parseTelegramChatIds("")).toEqual([]);
    const english = telegramCrossCaption({
      title: "Keep herbs alive",
      description: "Store the stems in water.",
      youtubeUrl: "https://www.youtube.com/watch?v=abc",
      language: "en"
    });
    expect(english).toContain("Keep herbs alive");
    expect(english).toContain("Store the stems in water.");
    expect(english).toContain("YouTube: https://www.youtube.com/watch?v=abc");
    expect(english).toContain("https://reelmino.com");
    expect(english.length).toBeLessThanOrEqual(1024);
    const hebrew = telegramCrossCaption({
      title: "שמרו על העשבים",
      description: "כוס מים על המדף.",
      youtubeUrl: "https://www.youtube.com/watch?v=abc",
      language: "he"
    });
    expect(hebrew).toContain("יוטיוב: https://www.youtube.com/watch?v=abc");
    expect(hebrew).toContain("https://reelmino.com");
    const long = telegramCrossCaption({
      title: "A".repeat(900),
      description: "B".repeat(900),
      youtubeUrl: "https://www.youtube.com/watch?v=abc",
      language: "en"
    });
    expect(long.length).toBeLessThanOrEqual(1024);
    expect(long).toContain("https://www.youtube.com/watch?v=abc");
    expect(long).toContain("https://reelmino.com");
    expect(telegramSendMode("short", TELEGRAM_VIDEO_LIMIT)).toBe("video");
    expect(telegramSendMode("short", TELEGRAM_VIDEO_LIMIT + 1)).toBe("message");
    expect(telegramSendMode("longform", 1000)).toBe("message");
  });

  it("waits for publishAt and for two hours between sends", () => {
    const now = new Date("2026-11-18T15:30:00.000Z");
    const gap = 2 * 60 * 60 * 1000;
    const early = { jobId: "early", publishAt: new Date("2026-11-18T13:00:00.000Z"), kind: "short" as const };
    const future = { jobId: "future", publishAt: new Date("2026-11-18T17:00:00.000Z"), kind: "short" as const };
    expect(selectTelegramPost({ now, minGapMs: gap, lastPostedAt: null, candidates: [future] })).toBeNull();
    expect(selectTelegramPost({ now, minGapMs: gap, lastPostedAt: null, candidates: [future, early] })?.jobId).toBe("early");
    expect(selectTelegramPost({
      now,
      minGapMs: gap,
      lastPostedAt: new Date("2026-11-18T14:00:00.000Z"),
      candidates: [early]
    })).toBeNull();
  });

  it("sends each short once, falls back when the file is missing, and posts the weekly link", async () => {
    const opened = db();
    seed(opened, { jobId: "short-1", source: "shorts-schedule", slot: "15:00", publishAt: "2026-11-18T13:00:00.000Z", videoId: "vid1", file: true });
    seed(opened, { jobId: "short-2", source: "shorts-schedule", slot: "19:00", publishAt: "2026-11-18T17:00:00.000Z", videoId: "vid2", file: false });
    seed(opened, { jobId: "weekly", source: "longform", slot: "18:00", publishAt: "2026-11-16T16:00:00.000Z", videoId: "long1", file: true });
    const calls: string[] = [];
    const client = recordingClient(calls);
    const now = new Date("2026-11-18T13:05:00.000Z");
    await advanceTelegramCrossPosts(opened.db, { now, mediaDir: opened.dir, log: () => undefined, client, chatIds: [CHAT, "@second"] });
    expect(calls).toEqual([`message:${CHAT}`, `message:@second`]);
    calls.length = 0;
    await advanceTelegramCrossPosts(opened.db, { now: new Date(now.getTime() + 3 * 60 * 60 * 1000), mediaDir: opened.dir, log: () => undefined, client, chatIds: [CHAT, "@second"] });
    expect(calls).toEqual([`video:${CHAT}`, `video:@second`]);
    calls.length = 0;
    await advanceTelegramCrossPosts(opened.db, { now: new Date(now.getTime() + 6 * 60 * 60 * 1000), mediaDir: opened.dir, log: () => undefined, client, chatIds: [CHAT, "@second"] });
    expect(calls).toEqual([`message:${CHAT}`, `message:@second`]);
    calls.length = 0;
    await advanceTelegramCrossPosts(opened.db, { now: new Date(now.getTime() + 9 * 60 * 60 * 1000), mediaDir: opened.dir, log: () => undefined, client, chatIds: [CHAT, "@second"] });
    expect(calls).toEqual([]);
    const rows = opened.db.prepare("SELECT job_id, network, status, detail FROM growth_crossposts ORDER BY job_id, network").all() as Array<{ job_id: string; network: string; status: string; detail: string }>;
    expect(rows.map((row) => `${row.job_id}:${row.network}:${row.status}:${row.detail}`)).toEqual([
      `short-1:telegram:${CHAT}:posted:msg-video`,
      "short-1:telegram:@second:posted:msg-video",
      `short-2:telegram:${CHAT}:posted:msg-message`,
      "short-2:telegram:@second:posted:msg-message",
      `weekly:telegram:${CHAT}:posted:msg-message`,
      "weekly:telegram:@second:posted:msg-message"
    ]);
  });

  it("logs a chat error and still posts the other chat, then skips when env is empty", async () => {
    const opened = db();
    seed(opened, { jobId: "short-1", source: "shorts-schedule", slot: "15:00", publishAt: "2026-11-18T13:00:00.000Z", videoId: "vid1", file: true });
    const calls: string[] = [];
    const client: TelegramClient = {
      sendVideo: async (input) => {
        calls.push(input.chatId);
        if (input.chatId === CHAT) throw new Error("bot was blocked");
        expect(input.caption).toContain("https://www.youtube.com/watch?v=vid1");
        return { messageId: "ok" };
      },
      sendMessage: async () => ({ messageId: "unused" })
    };
    const now = new Date("2026-11-18T13:05:00.000Z");
    const notes: string[] = [];
    await advanceTelegramCrossPosts(opened.db, { now, mediaDir: opened.dir, log: (message) => notes.push(message), client, chatIds: [CHAT, "@second"] });
    expect(calls).toEqual([CHAT, "@second"]);
    expect(notes.some((line) => line.includes("bot was blocked"))).toBe(true);
    const failed = opened.db.prepare("SELECT status FROM growth_crossposts WHERE network = ?").get(`telegram:${CHAT}`) as { status: string };
    expect(failed.status).toBe("retry");
    calls.length = 0;
    await advanceTelegramCrossPosts(opened.db, { now: new Date(now.getTime() + 30_000), mediaDir: opened.dir, log: () => undefined, client, chatIds: [CHAT, "@second"] });
    expect(calls).toEqual([]);
    const quiet = db();
    await advanceTelegramCrossPosts(quiet.db, { now, mediaDir: quiet.dir, log: () => undefined });
    expect(quiet.db.prepare("SELECT COUNT(*) AS n FROM growth_crossposts").get()).toEqual({ n: 0 });
  });
});

function recordingClient(calls: string[]): TelegramClient {
  return {
    sendVideo: async (input) => {
      calls.push(`video:${input.chatId}`);
      return { messageId: "msg-video" };
    },
    sendMessage: async (input) => {
      calls.push(`message:${input.chatId}`);
      expect(input.text).toContain("https://reelmino.com");
      return { messageId: "msg-message" };
    }
  };
}

function seed(
  opened: { db: GrowthDb; dir: string },
  input: { jobId: string; source: string; slot: string; publishAt: string; videoId: string; file: boolean }
): void {
  upsertDestination(opened.db, {
    id: "kitchen",
    connectionId: "conn-k",
    network: "youtube",
    kind: "channel",
    externalId: KITCHEN_CHANNEL_ID,
    name: "Kitchen Tips",
    handle: "@KitchenTips-Reelmino",
    url: "https://www.youtube.com/channel/UCsKPN8oZJOPM4KJC4bN_ANw",
    config: {}
  });
  const copy = emptyCopy();
  copy.youtube = { title: "Keep herbs alive", body: "Store the stems in water." };
  copy.article = { title: "Keep herbs alive", description: "Store the stems in water.", body: "Store the stems in water." };
  const item = insertItem(opened.db, {
    id: `item-${input.jobId}`,
    slug: `slug-${input.jobId}`,
    source: input.source,
    title: input.source === "longform" ? "3 tricks to keep food fresh" : "Keep herbs alive",
    summary: "short",
    language: "en",
    copy,
    mediaPath: input.file ? `${input.jobId}.mp4` : null,
    mediaMime: input.file ? "video/mp4" : null,
    mediaKind: input.file ? "video" : null,
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationMs: input.source === "longform" ? 240_000 : 20_000,
    reelminoRunId: null
  });
  if (input.file) writeFileSync(path.join(opened.dir, `${input.jobId}.mp4`), "mp4");
  insertJob(opened.db, { id: input.jobId, itemId: item.id, destinationId: "kitchen", slotId: null, network: "youtube", status: "published" });
  opened.db.prepare("UPDATE jobs SET remote_post_id = ? WHERE id = ?").run(input.videoId, input.jobId);
  const now = "2026-11-18T13:00:00.000Z";
  const key = input.source === "longform"
    ? `longform:2026-11-16:${KITCHEN_CHANNEL_ID}`
    : `shorts:${KITCHEN_CHANNEL_ID}:2026-11-18:${input.slot}`;
  opened.db.prepare(
    `INSERT INTO shorts_slots (slot_key, destination_id, publish_at, status, attempts, title, item_id, run_id, job_id, error, created_at, updated_at)
     VALUES (?, 'kitchen', ?, 'published', 1, ?, ?, NULL, ?, NULL, ?, ?)`
  ).run(key, input.publishAt, item.title, item.id, input.jobId, now, now);
}
