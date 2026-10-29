import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCopy } from "./copy.js";
import { listScriptRuns, openDb, upsertDestination, type GrowthDb } from "./db.js";
import { publishCopy } from "./publish.js";
import { buildApp } from "./server.js";
import {
  advanceScriptBank,
  applyScriptBankSettings,
  briefForEntry,
  runScriptEntry,
  saveScriptEntry
} from "./scriptBank.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bank-"));
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

describe("script bank", () => {
  it("turns keywords into an original brief and keeps a saved script", () => {
    const keywords = briefForEntry({ kind: "keywords", body: "חיתוך בצל, סכין חדה", language: "he" });
    expect(keywords.brief.aspectRatio).toBe("9:16");
    expect(keywords.brief.durationSeconds).toBe(30);
    expect(String(keywords.brief.sourceText)).toContain("חיתוך בצל");
    expect(String(keywords.brief.instructions)).toContain("מקורי");
    const script = briefForEntry({ kind: "script", body: "פותחים את המקרר.\nמוציאים עגבנייה.", language: "he" });
    expect(script.brief.sourceText).toBe("פותחים את המקרר.\nמוציאים עגבנייה.");
    expect(String(script.brief.instructions)).toContain("התסריט");
    expect(script.title).toBe("פותחים את המקרר.");
    const foreign = briefForEntry({ kind: "keywords", body: "onion cutting, sharp knife", language: "he" });
    expect(foreign.title).not.toMatch(/[A-Za-z]/);
    expect(foreign.description).not.toMatch(/onion/);
    expect(String(foreign.brief.instructions)).toContain("בעברית בלבד");
    expect(String(foreign.brief.sourceText)).toContain("onion cutting");
    const english = briefForEntry({ kind: "keywords", body: "חיתוך בצל", language: "en" });
    expect(english.title).toBe("What matters now");
    expect(english.description).not.toMatch(/\p{Script=Hebrew}/u);
    const titled = briefForEntry({ kind: "keywords", body: "onion cutting", language: "he", title: "איך חותכים בצל" });
    expect(titled.title).toBe("איך חותכים בצל");
    expect(titled.brief.title).toBe("איך חותכים בצל");
    expect(titled.description).toContain("איך חותכים בצל");
    expect(titled.description).not.toMatch(/onion/);
    expect(String(titled.brief.instructions)).toContain("איך חותכים בצל");
  });

  it("keeps the bank caption when the video is uploaded", () => {
    const copy = publishCopy({
      id: "i1",
      slug: "bank-1",
      source: "script-bank",
      title: "חיתוך בצל",
      summary: "סרטון מקורי",
      language: "he",
      copy: { ...emptyCopy(), youtube: { title: "חיתוך בצל", body: "טיפ אחד\n\n#Shorts" } },
      mediaPath: null,
      mediaMime: null,
      mediaKind: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationMs: null,
      reelminoRunId: null,
      createdAt: "2026-10-29T00:00:00.000Z",
      updatedAt: "2026-10-29T00:00:00.000Z"
    }, "youtube");
    expect(copy.title).toBe("חיתוך בצל");
    expect(copy.body).toContain("טיפ אחד");
  });

  it("stays idle until the bank is enabled", async () => {
    const opened = db();
    let called = false;
    await advanceScriptBank(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      { submitBrief: async () => { called = true; return "run"; } }
    );
    expect(called).toBe(false);
    expect(listScriptRuns(opened.db)).toHaveLength(0);
  });

  it("sends one entry per window to that entry's channel, then the next entry", async () => {
    const opened = db();
    channel(opened.db, "kitchen", "KitchenTips");
    channel(opened.db, "main", "reelmino");
    expect(applyScriptBankSettings(opened.db, { enabled: true, hours: 4, destinationId: "main" })).toBeNull();
    const first = saveScriptEntry(opened.db, { kind: "keywords", body: "חיתוך בצל", language: "he", destinationId: "kitchen", createdAt: "2026-10-29T10:00:00.000Z" });
    saveScriptEntry(opened.db, { kind: "script", body: "שוטפים ירקות.\nחותכים גזר.", language: "he", createdAt: "2026-10-29T11:00:00.000Z" });
    const briefs: Record<string, unknown>[] = [];
    let ready = false;
    const published: string[] = [];
    const deps = {
      now: new Date("2026-10-29T12:00:00Z"),
      pollAfterMs: 0,
      submitBrief: async (brief: Record<string, unknown>) => {
        briefs.push(brief);
        return `run-${briefs.length}`;
      },
      downloadFinal: async () => (ready ? { filename: "ready.mp4" } : null),
      publish: async (_itemId: string, destination: { id: string }) => {
        published.push(destination.id);
        return { id: "job-1", status: "published", remoteUrl: "https://youtu.be/ready" };
      }
    };
    const ctx = { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" };
    await advanceScriptBank(ctx, deps);
    expect(briefs).toHaveLength(1);
    expect(String(briefs[0]?.sourceText)).toContain("חיתוך בצל");
    expect(listScriptRuns(opened.db)[0]).toMatchObject({ destinationId: "kitchen", status: "producing", entryId: first.entry?.id });
    await advanceScriptBank(ctx, deps);
    expect(published).toHaveLength(0);
    ready = true;
    await advanceScriptBank(ctx, deps);
    expect(published).toEqual(["kitchen"]);
    expect(listScriptRuns(opened.db)[0]?.status).toBe("published");
    await advanceScriptBank(ctx, deps);
    expect(briefs).toHaveLength(1);
    await advanceScriptBank(ctx, { ...deps, now: new Date("2026-10-29T16:00:00Z") });
    expect(briefs).toHaveLength(2);
    expect(String(briefs[1]?.sourceText)).toContain("שוטפים ירקות");
    expect(listScriptRuns(opened.db)[0]).toMatchObject({ destinationId: "main", status: "producing" });
  });

  it("runs one saved entry on demand while the bank is off", async () => {
    const opened = db();
    channel(opened.db, "kitchen", "KitchenTips");
    const saved = saveScriptEntry(opened.db, { kind: "keywords", body: "אחסון תבלינים", destinationId: "kitchen" });
    expect(saved.error).toBeNull();
    const run = await runScriptEntry(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      saved.entry!.id,
      { submitBrief: async () => "run-manual" }
    );
    expect(run).toMatchObject({ status: "producing", destinationId: "kitchen", runId: "run-manual" });
    expect(saveScriptEntry(opened.db, { kind: "keywords", body: " " }).error).toContain("כותבים");
    expect(saveScriptEntry(opened.db, { kind: "keywords", body: "חיתוך בצל", language: "he", title: "How to cut an onion" }).error).toContain("עברית");
    const titled = saveScriptEntry(opened.db, { kind: "keywords", body: "onion cutting", language: "he", title: "איך חותכים בצל", destinationId: "kitchen" });
    expect(titled.entry?.title).toBe("איך חותכים בצל");
  });

  it("exposes the bank on the console", async () => {
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
      expect(page.body).toContain("מאגר");
      const login = await built.app.inject({ method: "POST", url: "/api/login", payload: { password: "secret" } });
      const setCookie = login.headers["set-cookie"];
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(";")[0]!;
      const empty = await built.app.inject({
        method: "POST",
        url: "/api/script-bank/entries",
        headers: { cookie },
        payload: { kind: "keywords", body: "א" }
      });
      expect(empty.statusCode).toBe(400);
      const saved = await built.app.inject({
        method: "POST",
        url: "/api/script-bank/entries",
        headers: { cookie },
        payload: { kind: "script", body: "שורה ראשונה של התסריט", language: "he" }
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().entries).toHaveLength(1);
      expect(saved.json().entries[0]).toMatchObject({ kind: "script", title: "", enabled: true, destinationId: null });
      const withTitle = await built.app.inject({
        method: "POST",
        url: "/api/script-bank/entries",
        headers: { cookie },
        payload: { kind: "keywords", title: "איך חותכים בצל", body: "onion cutting", language: "he" }
      });
      expect(withTitle.statusCode).toBe(200);
      expect(withTitle.json().entries.some((row: { title: string }) => row.title === "איך חותכים בצל")).toBe(true);
      const wrongLanguage = await built.app.inject({
        method: "POST",
        url: "/api/script-bank/entries",
        headers: { cookie },
        payload: { kind: "keywords", title: "How to cut an onion", body: "חיתוך בצל", language: "he" }
      });
      expect(wrongLanguage.statusCode).toBe(400);
      const settings = await built.app.inject({
        method: "PATCH",
        url: "/api/script-bank",
        headers: { cookie },
        payload: { enabled: false, hours: 6 }
      });
      expect(settings.json()).toMatchObject({ enabled: false, hours: 6 });
    } finally {
      await built.close();
    }
  });
});
