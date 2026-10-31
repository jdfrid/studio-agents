import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCopy } from "./copy.js";
import { insertItem, insertJob, openDb, upsertDestination, type GrowthDb } from "./db.js";
import { runScriptEntry, saveScriptEntry } from "./scriptBank.js";
import { jerusalemDayStart, YOUTUBE_DAILY_MESSAGE } from "./youtubeQuota.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function db(): GrowthDb {
  const dir = mkdtempSync(path.join(tmpdir(), "quota-"));
  dirs.push(dir);
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return opened;
}

describe("youtube daily upload cap", () => {
  it("starts the Jerusalem day at local midnight", () => {
    expect(jerusalemDayStart(new Date("2026-10-31T22:30:00.000Z"))).toBe("2026-10-31T22:00:00.000Z");
    expect(jerusalemDayStart(new Date("2026-07-15T09:00:00.000Z"))).toBe("2026-07-14T21:00:00.000Z");
  });

  it("stops the 17th upload for that channel and leaves the other channel open", async () => {
    const opened = db();
    const dir = dirs[dirs.length - 1]!;
    upsertDestination(opened, {
      id: "reelmino",
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: "reelmino",
      name: "Reelmino",
      handle: "@reelminoapp",
      url: "https://www.youtube.com/channel/reelmino",
      config: {}
    });
    upsertDestination(opened, {
      id: "kitchen",
      connectionId: "conn",
      network: "youtube",
      kind: "channel",
      externalId: "kitchen",
      name: "Kitchen",
      handle: "@kitchen",
      url: "https://www.youtube.com/channel/kitchen",
      config: {}
    });
    const item = insertItem(opened, {
      id: "item",
      slug: "item",
      source: "script-bank",
      title: "item",
      summary: "item",
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
    for (let index = 0; index < 16; index += 1) {
      insertJob(opened, { id: `job-${index}`, itemId: item.id, destinationId: "reelmino", slotId: null, network: "youtube", status: "published" });
    }
    insertJob(opened, { id: "old", itemId: item.id, destinationId: "reelmino", slotId: null, network: "youtube", status: "published" });
    opened.prepare("UPDATE jobs SET created_at = ? WHERE id = ?").run("2026-10-30T10:00:00.000Z", "old");
    const saved = saveScriptEntry(opened, { kind: "script", body: "שוטפים ירקות.\nחותכים גזר.", language: "he", destinationId: "reelmino" });
    const blocked = await runScriptEntry(
      { db: opened, key: Buffer.alloc(32), mediaDir: dir, publicBase: "http://127.0.0.1:4180" },
      saved.entry!.id,
      { submitBrief: async () => { throw new Error("should not produce"); } }
    );
    expect(blocked.status).toBe("failed");
    expect(blocked.error).toBe(YOUTUBE_DAILY_MESSAGE);
    const other = saveScriptEntry(opened, { kind: "script", body: "ממלאים מים בסיר.\nמוסיפים אורז.", language: "he", destinationId: "kitchen" });
    const started = await runScriptEntry(
      { db: opened, key: Buffer.alloc(32), mediaDir: dir, publicBase: "http://127.0.0.1:4180" },
      other.entry!.id,
      { submitBrief: async () => "run-kitchen" }
    );
    expect(started.status).toBe("producing");
    expect(started.runId).toBe("run-kitchen");
  });
});
