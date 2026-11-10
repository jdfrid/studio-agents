import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCopy } from "./copy.js";
import { getSetting, insertItem, insertJob, openDb, setSetting, updateJob, upsertDestination, type GrowthDb } from "./db.js";
import {
  TELEGRAM_COPY_DESTINATIONS,
  TELEGRAM_MIRROR_DESTINATION,
  advanceTelegramMirror,
  copyTopic,
  isTelegramInvite,
  normalizeTelegramChat,
  publicTelegramAddress,
  telegramCopyAddress,
  queueYouTubeMirror,
  skippedTelegramCopy,
  telegramCanPost,
  telegramCaption
} from "./telegramMirror.js";

const dbs: GrowthDb[] = [];

function db(): GrowthDb {
  const opened = openDb(path.join(mkdtempSync(path.join(tmpdir(), "tg-")), "growth.sqlite"));
  dbs.push(opened);
  return opened;
}

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

describe("telegram mirror", () => {
  it("uses the YouTube title and description as the Telegram caption", () => {
    expect(telegramCaption("Hero", "One sentence.")).toBe("Hero\n\nOne sentence.");
    expect(telegramCaption("Hero", `Hero\n\nAlready titled`)).toBe("Hero\n\nAlready titled");
    expect(telegramCaption("Hero", "x".repeat(1100)).length).toBe(1024);
    expect(normalizeTelegramChat("https://t.me/reelminoapp")).toBe("@reelminoapp");
    expect(isTelegramInvite("https://t.me/+e5O02F_bCPtlYjM0")).toBe(true);
    expect(isTelegramInvite("@reelminoapp")).toBe(false);
    expect(publicTelegramAddress("@reelminoapp")).toBe("@reelminoapp");
    expect(publicTelegramAddress("https://t.me/reelminoapp")).toBe("@reelminoapp");
    expect(publicTelegramAddress("https://t.me/+e5O02F_bCPtlYjM0")).toBeNull();
    expect(telegramCopyAddress("https://t.me/c/1530970452/18652")).toBe("-1001530970452");
    expect(telegramCopyAddress("@kingdomfood")).toBe("@kingdomfood");
    expect(telegramCopyAddress("https://t.me/+e5O02F_bCPtlYjM0")).toBeNull();
    expect(copyTopic("brand")).toBe("brand");
    expect(copyTopic("kitchen")).toBe("kitchen");
    expect(copyTopic("other")).toBeNull();
    expect(skippedTelegramCopy("@dishes")).toBe(true);
    expect(skippedTelegramCopy("@kingdomfood")).toBe(false);
    expect(telegramCanPost("channel", { status: "administrator", can_post_messages: true })).toBe(true);
    expect(telegramCanPost("channel", { status: "member" })).toBe(false);
    expect(telegramCanPost("group", { status: "member" })).toBe(true);
    expect(telegramCanPost("group", { status: "restricted", can_send_messages: false })).toBe(false);
    expect(telegramCanPost("group", { status: "left" })).toBe(false);
  });

  it("queues a video once when YouTube accepts it and sends that same text", async () => {
    const opened = db();
    upsertDestination(opened, {
      id: "tg",
      connectionId: "conn",
      network: "telegram",
      kind: "channel",
      externalId: "-1001",
      name: "Reelmino",
      handle: null,
      url: "https://t.me/+e5O02F_bCPtlYjM0",
      config: {}
    });
    setSetting(opened, TELEGRAM_MIRROR_DESTINATION, "tg");
    const copy = emptyCopy();
    const item = insertItem(opened, {
      id: "video-1",
      slug: "video-1",
      source: "kit",
      title: "Stored title",
      summary: "Stored summary",
      language: "en",
      copy,
      mediaPath: "video-1.mp4",
      mediaMime: "video/mp4",
      mediaKind: "video",
      mediaWidth: 1080,
      mediaHeight: 1920,
      mediaDurationMs: 30000,
      reelminoRunId: null
    });
    insertJob(opened, { id: "yt", itemId: item.id, destinationId: null, slotId: null, network: "youtube", status: "published" });
    updateJob(opened, "yt", { handle: { snippet: { title: "Hero — Reelmino in 30 seconds", description: "Your prompt. Your brand.\n\nhttps://reelmino.com" } } });
    queueYouTubeMirror(opened, "uploading", "published", item.id);
    queueYouTubeMirror(opened, "published", "published", item.id);
    const seen: string[] = [];
    await advanceTelegramMirror(opened, async (_item, destination, text) => {
      seen.push(`${destination.id}:${text.body}`);
      return { status: "published" };
    });
    expect(seen).toEqual(["tg:Hero — Reelmino in 30 seconds\n\nYour prompt. Your brand.\n\nhttps://reelmino.com"]);
    expect(getSetting(opened, "telegram_mirror_queue")).toBe("[]");
  });

  it("does not send a video that already reached the channel, and drops a video after three failures", async () => {
    const opened = db();
    upsertDestination(opened, {
      id: "tg",
      connectionId: "conn",
      network: "telegram",
      kind: "channel",
      externalId: "-1001",
      name: "Reelmino",
      handle: null,
      url: null,
      config: {}
    });
    const copy = emptyCopy();
    insertItem(opened, {
      id: "video-2",
      slug: "video-2",
      source: "kit",
      title: "Second",
      summary: "Second",
      language: "en",
      copy,
      mediaPath: "video-2.mp4",
      mediaMime: "video/mp4",
      mediaKind: "video",
      mediaWidth: 1080,
      mediaHeight: 1920,
      mediaDurationMs: 30000,
      reelminoRunId: null
    });
    insertJob(opened, { id: "sent", itemId: "video-2", destinationId: "tg", slotId: null, network: "telegram", status: "published" });
    queueYouTubeMirror(opened, "uploading", "published", "video-2");
    let calls = 0;
    await advanceTelegramMirror(opened, async () => {
      calls += 1;
      return { status: "published" };
    });
    expect(calls).toBe(0);

    insertItem(opened, {
      id: "video-3",
      slug: "video-3",
      source: "kit",
      title: "Third",
      summary: "Third",
      language: "en",
      copy,
      mediaPath: "video-3.mp4",
      mediaMime: "video/mp4",
      mediaKind: "video",
      mediaWidth: 1080,
      mediaHeight: 1920,
      mediaDurationMs: 30000,
      reelminoRunId: null
    });
    for (const id of ["f1", "f2", "f3"]) {
      insertJob(opened, { id, itemId: "video-3", destinationId: "tg", slotId: null, network: "telegram", status: "failed" });
    }
    queueYouTubeMirror(opened, "uploading", "published", "video-3");
    await advanceTelegramMirror(opened, async () => {
      calls += 1;
      return { status: "failed" };
    });
    expect(calls).toBe(0);
    expect(getSetting(opened, "telegram_mirror_queue")).toBe("[]");
  });

  it("copies a published home post to a public channel on the next pass", async () => {
    const opened = db();
    upsertDestination(opened, {
      id: "home",
      connectionId: "conn",
      network: "telegram",
      kind: "channel",
      externalId: "-1001",
      name: "ReelMino",
      handle: null,
      url: null,
      config: {}
    });
    upsertDestination(opened, {
      id: "public",
      connectionId: "conn",
      network: "telegram",
      kind: "channel",
      externalId: "-1002",
      name: "Public",
      handle: "reelmino",
      url: "https://t.me/reelmino",
      config: { copyTopic: "brand" }
    });
    setSetting(opened, TELEGRAM_MIRROR_DESTINATION, "home");
    setSetting(opened, TELEGRAM_COPY_DESTINATIONS, JSON.stringify(["public"]));
    const copy = emptyCopy();
    insertItem(opened, {
      id: "video-4",
      slug: "video-4",
      source: "kit",
      title: "Copied",
      summary: "Copied",
      language: "en",
      copy,
      mediaPath: "video-4.mp4",
      mediaMime: "video/mp4",
      mediaKind: "video",
      mediaWidth: 1080,
      mediaHeight: 1920,
      mediaDurationMs: 30000,
      reelminoRunId: null
    });
    insertJob(opened, { id: "yt4", itemId: "video-4", destinationId: null, slotId: null, network: "youtube", status: "published" });
    updateJob(opened, "yt4", { handle: { snippet: { title: "Hero", description: "Same caption" } } });
    queueYouTubeMirror(opened, "uploading", "published", "video-4");
    const seen: string[] = [];
    await advanceTelegramMirror(opened, async (_item, destination, text) => {
      seen.push(`${destination.id}:${text.body}`);
      return { status: "published" };
    });
    expect(seen).toEqual(["home:Hero\n\nSame caption"]);
    await advanceTelegramMirror(opened, async (_item, destination, text) => {
      seen.push(`${destination.id}:${text.body}`);
      return { status: "published" };
    });
    expect(seen).toEqual(["home:Hero\n\nSame caption", "public:Hero\n\nSame caption"]);
    expect(getSetting(opened, "telegram_mirror_queue")).toBe("[]");
  });

  it("copies a brand video only to video groups and a kitchen video only to cooking groups", async () => {
    const opened = db();
    upsertDestination(opened, {
      id: "home",
      connectionId: "conn",
      network: "telegram",
      kind: "channel",
      externalId: "-1001",
      name: "ReelMino",
      handle: null,
      url: null,
      config: {}
    });
    upsertDestination(opened, {
      id: "video-group",
      connectionId: "conn",
      network: "telegram",
      kind: "group",
      externalId: "-1002",
      name: "Video",
      handle: "videogroup",
      url: "https://t.me/videogroup",
      config: { copyTopic: "brand" }
    });
    upsertDestination(opened, {
      id: "kitchen-group",
      connectionId: "conn",
      network: "telegram",
      kind: "group",
      externalId: "-1003",
      name: "Kitchen",
      handle: "kitchengroup",
      url: "https://t.me/kitchengroup",
      config: { copyTopic: "kitchen" }
    });
    upsertDestination(opened, {
      id: "yt-brand",
      connectionId: "yt",
      network: "youtube",
      kind: "channel",
      externalId: "brand-channel",
      name: "Reelmino",
      handle: "reelminoapp",
      url: "https://www.youtube.com/@reelminoapp",
      config: {}
    });
    upsertDestination(opened, {
      id: "yt-kitchen",
      connectionId: "yt",
      network: "youtube",
      kind: "channel",
      externalId: "kitchen-channel",
      name: "Kitchen Tips",
      handle: "kitchentips-reelmino",
      url: "https://www.youtube.com/@kitchentips-reelmino",
      config: {}
    });
    setSetting(opened, TELEGRAM_MIRROR_DESTINATION, "home");
    setSetting(opened, TELEGRAM_COPY_DESTINATIONS, JSON.stringify(["video-group", "kitchen-group"]));
    const copy = emptyCopy();
    const media = {
      source: "kit" as const,
      language: "en",
      copy,
      mediaMime: "video/mp4",
      mediaKind: "video" as const,
      mediaWidth: 1080,
      mediaHeight: 1920,
      mediaDurationMs: 30000,
      reelminoRunId: null
    };
    insertItem(opened, { id: "brand-video", slug: "brand-video", title: "Brand", summary: "Brand", mediaPath: "brand.mp4", ...media });
    insertItem(opened, { id: "kitchen-video", slug: "kitchen-video", title: "Kitchen", summary: "Kitchen", mediaPath: "kitchen.mp4", ...media, source: "script-bank" });
    insertJob(opened, { id: "yt-b", itemId: "brand-video", destinationId: "yt-brand", slotId: null, network: "youtube", status: "published" });
    updateJob(opened, "yt-b", { handle: { snippet: { title: "Brand title", description: "Brand text" } } });
    insertJob(opened, { id: "yt-k", itemId: "kitchen-video", destinationId: "yt-kitchen", slotId: null, network: "youtube", status: "published" });
    updateJob(opened, "yt-k", { handle: { snippet: { title: "Kitchen title", description: "Kitchen text" } } });
    queueYouTubeMirror(opened, "uploading", "published", "brand-video");
    queueYouTubeMirror(opened, "uploading", "published", "kitchen-video");
    const seen: string[] = [];
    const publish = async (_item: { id: string }, destination: { id: string }, text: { body: string }) => {
      seen.push(`${destination.id}:${text.body}`);
      return { status: "published" as const };
    };
    await advanceTelegramMirror(opened, publish);
    await advanceTelegramMirror(opened, publish);
    await advanceTelegramMirror(opened, publish);
    await advanceTelegramMirror(opened, publish);
    expect(seen).toEqual([
      "home:Brand title\n\nBrand text",
      "home:Kitchen title\n\nKitchen text",
      "video-group:Brand title\n\nBrand text",
      "kitchen-group:Kitchen title\n\nKitchen text"
    ]);
  });

  it("copies a brand video to a private group that has no public name", async () => {
    const opened = db();
    upsertDestination(opened, {
      id: "home",
      connectionId: "conn",
      network: "telegram",
      kind: "channel",
      externalId: "-1001",
      name: "ReelMino",
      handle: null,
      url: null,
      config: {}
    });
    upsertDestination(opened, {
      id: "private",
      connectionId: "conn",
      network: "telegram",
      kind: "group",
      externalId: "-1001530970452",
      name: "Private",
      handle: null,
      url: "https://t.me/c/1530970452",
      config: { copyTopic: "brand" }
    });
    setSetting(opened, TELEGRAM_MIRROR_DESTINATION, "home");
    setSetting(opened, TELEGRAM_COPY_DESTINATIONS, JSON.stringify(["private"]));
    const copy = emptyCopy();
    insertItem(opened, {
      id: "brand-private",
      slug: "brand-private",
      source: "kit",
      title: "Brand",
      summary: "Brand",
      language: "en",
      copy,
      mediaPath: "brand.mp4",
      mediaMime: "video/mp4",
      mediaKind: "video",
      mediaWidth: 1080,
      mediaHeight: 1920,
      mediaDurationMs: 30000,
      reelminoRunId: null
    });
    insertJob(opened, { id: "yt-p", itemId: "brand-private", destinationId: null, slotId: null, network: "youtube", status: "published" });
    updateJob(opened, "yt-p", { handle: { snippet: { title: "Brand title", description: "Brand text" } } });
    queueYouTubeMirror(opened, "uploading", "published", "brand-private");
    const seen: string[] = [];
    await advanceTelegramMirror(opened, async (_item, destination) => {
      seen.push(destination.id);
      return { status: "published" };
    });
    await advanceTelegramMirror(opened, async (_item, destination) => {
      seen.push(destination.id);
      return { status: "published" };
    });
    expect(seen).toEqual(["home", "private"]);
  });

  it("waits until the YouTube link is public, then posts the link with the description", async () => {
    const opened = db();
    upsertDestination(opened, {
      id: "tg",
      connectionId: "conn",
      network: "telegram",
      kind: "channel",
      externalId: "-1001",
      name: "ReelMino",
      handle: null,
      url: null,
      config: {}
    });
    setSetting(opened, TELEGRAM_MIRROR_DESTINATION, "tg");
    const copy = emptyCopy();
    insertItem(opened, {
      id: "held",
      slug: "held",
      source: "kit",
      title: "Held",
      summary: "Held",
      language: "en",
      copy,
      mediaPath: "held.mp4",
      mediaMime: "video/mp4",
      mediaKind: "video",
      mediaWidth: 1080,
      mediaHeight: 1920,
      mediaDurationMs: 30000,
      reelminoRunId: null
    });
    insertJob(opened, { id: "yt-held", itemId: "held", destinationId: null, slotId: null, network: "youtube", status: "published" });
    updateJob(opened, "yt-held", {
      remoteUrl: "https://youtu.be/abc123",
      handle: {
        snippet: { title: "Click this", description: "The useful part." },
        status: { privacyStatus: "private", publishAt: "2099-01-01T00:00:00.000Z" }
      }
    });
    queueYouTubeMirror(opened, "uploading", "published", "held");
    const seen: string[] = [];
    await advanceTelegramMirror(opened, async (_item, _destination, text) => {
      seen.push(text.body);
      return { status: "published" };
    });
    expect(seen).toEqual([]);
    updateJob(opened, "yt-held", {
      remoteUrl: "https://youtu.be/abc123",
      handle: {
        snippet: { title: "Click this", description: "The useful part." },
        status: { privacyStatus: "public", publishAt: "2020-01-01T00:00:00.000Z" }
      }
    });
    await advanceTelegramMirror(opened, async (_item, _destination, text) => {
      seen.push(text.body);
      return { status: "published" };
    });
    expect(seen).toEqual(["Click this\n\nThe useful part.\n\nhttps://youtu.be/abc123"]);
  });
});
