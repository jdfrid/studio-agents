import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listScriptEntries, listScriptRuns, openDb, upsertDestination, type GrowthDb } from "./db.js";
import {
  advanceKeywordFeeds,
  fillKeywordFeed,
  freshIdeas,
  saveKeywordFeed,
  titlesFromSearch
} from "./keywordFeeds.js";
import { advanceScriptBank, saveScriptEntry } from "./scriptBank.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "feeds-"));
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

function channel(opened: GrowthDb, id: string, name: string): void {
  upsertDestination(opened, {
    id,
    connectionId: "conn",
    network: "youtube",
    kind: "channel",
    externalId: id,
    name,
    handle: `@${name}`,
    url: `https://www.youtube.com/channel/${id}`,
    config: {}
  });
}

describe("keyword feeds", () => {
  it("keeps distinct search topics and reads titles", () => {
    expect(titlesFromSearch({ items: [{ snippet: { title: "טיפ לבצל" } }, { snippet: { title: "  " } }, {}] })).toEqual(["טיפ לבצל"]);
    const ideas = freshIdeas(
      ["How to cut an onion without tears", "Store fresh parsley longer"],
      ["cut onion without tears"]
    );
    expect(ideas.join(" ")).toMatch(/parsley/i);
    expect(ideas.join(" ")).not.toMatch(/onion/i);
  });

  it("writes scripts in the selected language for that channel", async () => {
    const opened = db();
    channel(opened.db, "kitchen", "KitchenTips");
    const saved = saveKeywordFeed(opened.db, { query: "טיפים למטבח", language: "en", destinationId: "kitchen", hours: 4 });
    expect(saved.error).toBeNull();
    const filled = await fillKeywordFeed(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      saved.feed!.id,
      {
        search: async () => ["איך חותכים בצל בלי דמעות", "איך שומרים פטרוזיליה"],
        writeScripts: async () => [
          { title: "איך חותכים בצל", script: "חותכים את השורש ושוטפים במים." },
          { title: "How to cut an onion", script: "Cut the root off.\nRinse the onion under water.\nThe tears stop." }
        ]
      }
    );
    expect(filled.added).toBe(1);
    const entries = listScriptEntries(opened.db);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "script", language: "en", destinationId: "kitchen", feedId: saved.feed!.id, title: "How to cut an onion" });
    expect(entries[0]?.body).not.toMatch(/\p{Script=Hebrew}/u);
    expect(saveKeywordFeed(opened.db, { query: "טיפים", language: "he" }).error).toContain("ערוץ");
  });

  it("produces one video per channel window from that channel's keyword", async () => {
    const opened = db();
    channel(opened.db, "kitchen", "KitchenTips");
    channel(opened.db, "main", "Reelmino");
    const kitchen = saveKeywordFeed(opened.db, { query: "kitchen tips", language: "en", destinationId: "kitchen", hours: 4, enabled: true });
    const main = saveKeywordFeed(opened.db, { query: "app tips", language: "en", destinationId: "main", hours: 4, enabled: true });
    saveScriptEntry(opened.db, { kind: "script", body: "Cut the onion.\nRinse it.", language: "en", destinationId: "kitchen", feedId: kitchen.feed!.id, title: "Cut an onion" });
    saveScriptEntry(opened.db, { kind: "script", body: "Open the app.\nType one sentence.", language: "en", destinationId: "main", feedId: main.feed!.id, title: "One sentence video" });
    saveScriptEntry(opened.db, { kind: "keywords", body: "manual topic", language: "en", destinationId: "main" });
    const briefs: string[] = [];
    const published: string[] = [];
    let ready = false;
    const deps = {
      now: new Date("2026-10-29T12:00:00Z"),
      pollAfterMs: 0,
      search: async () => [],
      writeScripts: async () => [],
      submitBrief: async (brief: Record<string, unknown>) => {
        briefs.push(String(brief.title));
        return `run-${briefs.length}`;
      },
      downloadFinal: async () => (ready ? { filename: "ready.mp4" } : null),
      publish: async (_itemId: string, destination: { id: string }) => {
        published.push(destination.id);
        return { id: "job-1", status: "published", remoteUrl: "https://youtu.be/ready" };
      }
    };
    const ctx = { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" };
    await advanceKeywordFeeds(ctx, deps);
    expect(briefs).toEqual(["Cut an onion"]);
    expect(listScriptRuns(opened.db)[0]?.destinationId).toBe("kitchen");
    ready = true;
    await advanceScriptBank(ctx, deps);
    expect(published).toEqual(["kitchen"]);
    await advanceKeywordFeeds(ctx, deps);
    expect(briefs).toEqual(["Cut an onion", "One sentence video"]);
    expect(listScriptRuns(opened.db)[0]?.destinationId).toBe("main");
    expect(listScriptEntries(opened.db).some((entry) => entry.body === "manual topic" && !entry.feedId)).toBe(true);
  });
});
