import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, upsertDestination, insertItem, insertJob, type GrowthDb } from "./db.js";
import { emptyCopy } from "./copy.js";
import { judgeTitleWithModel, mp4DurationSeconds, readShortsDailyCap, recentChannelPosts } from "./shortsGate.js";
import { runScriptEntry, saveScriptEntry } from "./scriptBank.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  delete process.env.SHORTS_DAILY_CAP;
});

function db(): { db: GrowthDb; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "shorts-gate-"));
  dirs.push(dir);
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return { db: opened, dir };
}

describe("shorts publish gate", () => {
  it("reads a simple mp4 duration and the daily cap setting", () => {
    const body = Buffer.alloc(32);
    body.write("mvhd", 0);
    body.writeUInt8(0, 4);
    body.writeUInt32BE(1000, 4 + 12);
    body.writeUInt32BE(18_000, 4 + 16);
    expect(mp4DurationSeconds(body)).toBe(18);
    const opened = db();
    expect(readShortsDailyCap(opened.db)).toBe(3);
    process.env.SHORTS_DAILY_CAP = "5";
    expect(readShortsDailyCap(opened.db)).toBe(5);
  });

  it("does not render a fourth short for that channel today", async () => {
    const opened = db();
    upsertDestination(opened.db, {
      id: "kitchen",
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: "kitchen",
      name: "Kitchen Tips",
      handle: "@KitchenTips-Reelmino",
      url: "https://www.youtube.com/@KitchenTips-Reelmino",
      config: {}
    });
    const item = insertItem(opened.db, {
      id: "old",
      slug: "old",
      source: "script-bank",
      title: "How to keep fresh herbs alive for weeks",
      summary: "Herbs",
      language: "en",
      copy: emptyCopy(),
      mediaPath: null,
      mediaMime: null,
      mediaKind: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationMs: 18_000,
      reelminoRunId: null
    });
    for (let index = 0; index < 3; index += 1) {
      insertJob(opened.db, {
        id: `sent-${index}`,
        itemId: item.id,
        destinationId: "kitchen",
        slotId: null,
        network: "youtube",
        status: "published"
      });
    }
    const saved = saveScriptEntry(opened.db, {
      kind: "script",
      body: "Stop letting the herbs die.\nStand them in water.",
      language: "en",
      title: "How to keep fresh herbs alive for weeks",
      destinationId: "kitchen"
    });
    let rendered = false;
    const run = await runScriptEntry(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      saved.entry!.id,
      { submitBrief: async () => { rendered = true; return "run"; } }
    );
    expect(rendered).toBe(false);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/Daily cap/);
  });

  it("does not treat the upload that is in progress as its own duplicate", () => {
    const opened = db();
    upsertDestination(opened.db, {
      id: "kitchen",
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: "kitchen",
      name: "Kitchen Tips",
      handle: "@KitchenTips-Reelmino",
      url: "https://www.youtube.com/@KitchenTips-Reelmino",
      config: {}
    });
    const item = insertItem(opened.db, {
      id: "herbs",
      slug: "herbs",
      source: "script-bank",
      title: "How to keep fresh herbs alive for weeks",
      summary: "Herbs",
      language: "en",
      copy: {
        ...emptyCopy(),
        article: {
          title: "How to keep fresh herbs alive for weeks",
          description: "Stand the stems in water.",
          body: "Stop letting fresh herbs turn to mush.\nStand the stems in water.\nStop letting fresh herbs turn to mush."
        }
      },
      mediaPath: null,
      mediaMime: null,
      mediaKind: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationMs: 18_000,
      reelminoRunId: null
    });
    insertJob(opened.db, {
      id: "current",
      itemId: item.id,
      destinationId: "kitchen",
      slotId: null,
      network: "youtube",
      status: "uploading"
    });
    insertJob(opened.db, {
      id: "older",
      itemId: item.id,
      destinationId: "kitchen",
      slotId: null,
      network: "youtube",
      status: "published"
    });
    expect(recentChannelPosts(opened.db, "kitchen", new Date(), "current").map((post) => post.title)).toEqual([
      "How to keep fresh herbs alive for weeks"
    ]);
    expect(recentChannelPosts(opened.db, "kitchen").map((post) => post.title)).toHaveLength(2);
  });

  it("asks the title model only when that check is turned on", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"matches\":false,\"reason\":\"onions\"}" }] } }] }));
    }) as typeof fetch;
    expect(await judgeTitleWithModel({ title: "Onions", script: "Herbs in water.", language: "en" }, { enabled: false, fetchImpl })).toBeNull();
    expect(called).toBe(false);
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    try {
      const verdict = await judgeTitleWithModel(
        { title: "Onions", script: "Herbs in water.", language: "en" },
        { enabled: true, fetchImpl }
      );
      expect(verdict).toEqual({ matches: false, reason: "onions" });
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });
});
