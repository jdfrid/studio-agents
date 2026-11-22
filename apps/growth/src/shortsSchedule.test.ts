import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, upsertDestination, type GrowthDb } from "./db.js";
import {
  KITCHEN_CHANNEL_ID,
  REELMINO_CHANNEL_ID,
  advanceShortsSchedule,
  briefForScheduledShort,
  decideSlot,
  localDay,
  parseClockList,
  longFormReplacesShort,
  scheduleFor,
  slotInstant,
  slotKey
} from "./shortsSchedule.js";

const dirs: string[] = [];
const dbs: GrowthDb[] = [];
const envKeys = ["SHORTS_SCHEDULE_KITCHEN", "SHORTS_SCHEDULE_REELMINO", "SHORTS_DAILY_CAP", "SHORTS_TIMEZONE", "SHORTS_LEAD_MINUTES"] as const;
const previous = new Map<string, string | undefined>();

function rememberEnv(): void {
  for (const key of envKeys) {
    if (!previous.has(key)) previous.set(key, process.env[key]);
  }
}

afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  for (const key of envKeys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previous.clear();
});

function db(): { db: GrowthDb; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "shorts-schedule-"));
  dirs.push(dir);
  const opened = openDb(path.join(dir, "growth.sqlite"));
  dbs.push(opened);
  return { db: opened, dir };
}

function channel(opened: GrowthDb, id: string, name: string, externalId: string): void {
  upsertDestination(opened, {
    id,
    connectionId: "conn",
    network: "youtube",
    kind: "channel",
    externalId,
    name,
    handle: `@${name}`,
    url: `https://www.youtube.com/channel/${externalId}`,
    config: {}
  });
}

function at(day: string, hhmm: string): Date {
  return slotInstant(day, hhmm, "Asia/Jerusalem");
}

describe("shorts schedule", () => {
  it("keeps the Jerusalem clock and the default times", () => {
    rememberEnv();
    delete process.env.SHORTS_SCHEDULE_KITCHEN;
    delete process.env.SHORTS_SCHEDULE_REELMINO;
    expect(parseClockList("23:00, 15:00, 15:00, noon", ["15:00"])).toEqual(["15:00", "23:00"]);
    expect(scheduleFor("kitchen")).toEqual(["15:00", "19:00", "23:00"]);
    expect(scheduleFor("product")).toEqual(["16:00", "21:00"]);
    const tuesday = at("2026-11-17", "19:00");
    const thursday = at("2026-11-19", "16:00");
    expect(longFormReplacesShort("kitchen", "19:00", tuesday, "Asia/Jerusalem")).toBe(true);
    expect(longFormReplacesShort("kitchen", "15:00", tuesday, "Asia/Jerusalem")).toBe(false);
    expect(longFormReplacesShort("product", "16:00", thursday, "Asia/Jerusalem")).toBe(true);
    expect(longFormReplacesShort("product", "16:00", tuesday, "Asia/Jerusalem")).toBe(false);
    const slot = at("2026-11-17", "15:00");
    const jerusalem = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(slot);
    const eastern = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(slot);
    expect(jerusalem).toBe("15:00");
    expect(eastern).toBe("08:00");
    expect(localDay(slot, "Asia/Jerusalem")).toBe("2026-11-17");
  });

  it("selects one action per slot and does not catch up or pass a paused channel", () => {
    const publishAt = at("2026-11-17", "15:00");
    const leadAt = new Date(publishAt.getTime() - 90 * 60_000);
    const base = { publishAt, leadAt, attempts: 0, fileReady: false, gateFailed: false, publishedToday: 0, dailyCap: 3 };
    expect(decideSlot({ ...base, now: new Date(leadAt.getTime() - 60_000), status: null }).action).toBe("wait");
    expect(decideSlot({ ...base, now: new Date(leadAt.getTime() + 60_000), status: null }).action).toBe("start");
    expect(decideSlot({ ...base, now: new Date(leadAt.getTime() + 60_000), status: "producing" }).action).toBe("poll");
    expect(decideSlot({ ...base, now: publishAt, status: "producing", fileReady: true }).action).toBe("upload");
    expect(decideSlot({ ...base, now: publishAt, status: "published", fileReady: true }).action).toBe("wait");
    expect(decideSlot({ ...base, now: new Date(publishAt.getTime() + 60_000), status: null }).reason).toBe("missed slot");
    expect(decideSlot({ ...base, now: leadAt, status: null, dailyCap: 0 }).action).toBe("wait");
    expect(decideSlot({ ...base, now: new Date(publishAt.getTime() + 60_000), status: null, dailyCap: 0 }).reason).toBe("channel paused (SHORTS_DAILY_CAP=0)");
    expect(decideSlot({ ...base, now: leadAt, status: null, publishedToday: 3 }).reason).toBe("daily cap");
    expect(decideSlot({ ...base, now: leadAt, status: "failed", attempts: 1, gateFailed: true }).action).toBe("regenerate");
    expect(decideSlot({ ...base, now: leadAt, status: "failed", attempts: 3, gateFailed: true }).action).toBe("skip");
    expect(decideSlot({ ...base, now: new Date(leadAt.getTime() + 2 * 60 * 60 * 1000), status: "producing", attempts: 1, updatedAt: leadAt }).reason).toBe("production timed out");
  });

  it("builds a kitchen short and a product short from different topic lists", () => {
    const kitchen = briefForScheduledShort({ kind: "kitchen", recentTitles: [] });
    const product = briefForScheduledShort({ kind: "product", recentTitles: [] });
    expect(kitchen?.title.toLowerCase()).toMatch(/herb|produce|leftover|fridge|kitchen/);
    expect(String(kitchen?.brief.instructions)).toContain("15 to 20");
    expect(kitchen?.brief.durationSeconds).toBe(20);
    expect(product?.title.toLowerCase()).not.toMatch(/herb|produce|fridge|leftover/);
    expect(String(product?.brief.sourceText)).toMatch(/pinned comment/i);
    expect(String(product?.brief.instructions)).toContain("Do not make a kitchen");
    const music = briefForScheduledShort({
      kind: "kitchen",
      recentTitles: [],
      demandPhrase: "Anuel AA | SE TOCO EL T*TITO CON MI GL*CK (Video Oficial)"
    });
    expect(music?.title.toLowerCase()).not.toContain("anuel");
    expect(music?.title.toLowerCase()).toMatch(/herb|produce|leftover|fridge|kitchen|spice|bread|egg|cheese|soup|onion|berr|rice|pan|stove/);
    expect(String(product?.brief.instructions)).toContain("No trailers");
  });

  it("publishes one kitchen short for the slot and skips a missed one", async () => {
    rememberEnv();
    delete process.env.SHORTS_SCHEDULE_KITCHEN;
    delete process.env.SHORTS_DAILY_CAP;
    const opened = db();
    channel(opened.db, "kitchen", "KitchenTips-Reelmino", KITCHEN_CHANNEL_ID);
    const day = "2026-11-17";
    const submits: string[] = [];
    const publishes: Array<Date | null> = [];
    let ready = false;
    const deps = {
      now: at(day, "14:00"),
      submitBrief: async (brief: Record<string, unknown>) => {
        submits.push(String(brief.title));
        return `run-${submits.length}`;
      },
      downloadFinal: async () => (ready ? { filename: "ready.mp4" } : null),
      publish: async (_itemId: string, _destination: { id: string }, publishAt: Date | null) => {
        publishes.push(publishAt);
        return { id: "job-1", status: "published", remoteUrl: "https://youtu.be/ready" };
      },
      log: () => undefined
    };
    const ctx = { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" };
    await advanceShortsSchedule(ctx, deps);
    expect(submits).toHaveLength(1);
    await advanceShortsSchedule(ctx, deps);
    expect(submits).toHaveLength(1);
    expect(publishes).toHaveLength(0);
    ready = true;
    await advanceShortsSchedule(ctx, deps);
    expect(publishes).toHaveLength(1);
    expect(publishes[0]?.toISOString()).toBe(at(day, "15:00").toISOString());
    await advanceShortsSchedule(ctx, deps);
    expect(publishes).toHaveLength(1);
    const missed = db();
    channel(missed.db, "kitchen", "KitchenTips-Reelmino", KITCHEN_CHANNEL_ID);
    const notes: string[] = [];
    await advanceShortsSchedule(
      { ...ctx, db: missed.db, mediaDir: missed.dir },
      { ...deps, now: at(day, "15:30"), submitBrief: async () => { throw new Error("should not start"); }, log: (line) => notes.push(line) }
    );
    expect(notes.join(" ")).toMatch(/missed slot/);
    const key = slotKey(KITCHEN_CHANNEL_ID, day, "15:00");
    const row = missed.db.prepare("SELECT status, error FROM shorts_slots WHERE slot_key = ?").get(key) as { status: string; error: string };
    expect(row).toMatchObject({ status: "skipped", error: "missed slot" });
  });

  it("pauses on a zero cap and gives a rejected slot two more takes", async () => {
    rememberEnv();
    delete process.env.SHORTS_SCHEDULE_KITCHEN;
    process.env.SHORTS_DAILY_CAP = "0";
    const opened = db();
    channel(opened.db, "kitchen", "KitchenTips-Reelmino", KITCHEN_CHANNEL_ID);
    let started = false;
    await advanceShortsSchedule(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      {
        now: at("2026-11-17", "14:00"),
        submitBrief: async () => { started = true; return "run"; },
        log: () => undefined
      }
    );
    expect(started).toBe(false);
    const beforeSlot = opened.db.prepare("SELECT COUNT(*) AS n FROM shorts_slots").get() as { n: number };
    expect(Number(beforeSlot.n)).toBe(0);
    await advanceShortsSchedule(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      { now: at("2026-11-17", "15:30"), submitBrief: async () => { started = true; return "run"; }, log: () => undefined }
    );
    const paused = opened.db.prepare("SELECT error FROM shorts_slots WHERE slot_key LIKE '%15:00'").get() as { error: string };
    expect(paused.error).toMatch(/paused/);

    delete process.env.SHORTS_DAILY_CAP;
    const retry = db();
    channel(retry.db, "product", "reelminoapp", REELMINO_CHANNEL_ID);
    const submits: string[] = [];
    const ctx = { db: retry.db, key: Buffer.alloc(32), mediaDir: retry.dir, publicBase: "http://127.0.0.1:4180" };
    const deps = {
      now: at("2026-11-17", "15:00"),
      submitBrief: async () => {
        submits.push("made");
        return `run-${submits.length}`;
      },
      downloadFinal: async () => ({ filename: "ready.mp4" }),
      publish: async () => ({ id: `job-${submits.length}`, status: "failed", errorCode: "shorts_quality", lastError: "Title does not describe the script." }),
      log: () => undefined
    };
    await advanceShortsSchedule(ctx, deps);
    await advanceShortsSchedule(ctx, deps);
    await advanceShortsSchedule(ctx, deps);
    await advanceShortsSchedule(ctx, deps);
    expect(submits).toHaveLength(3);
    const skipped = retry.db.prepare("SELECT status FROM shorts_slots WHERE slot_key LIKE '%16:00'").get() as { status: string };
    expect(skipped.status).toBe("skipped");
  });

  it("asks YouTube to post the example prompt after a product upload", async () => {
    rememberEnv();
    delete process.env.SHORTS_SCHEDULE_REELMINO;
    delete process.env.SHORTS_DAILY_CAP;
    const opened = db();
    channel(opened.db, "product", "reelminoapp", REELMINO_CHANNEL_ID);
    const comments: string[] = [];
    await advanceShortsSchedule(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      {
        now: at("2026-11-17", "15:00"),
        submitBrief: async () => "run-product",
        downloadFinal: async () => null,
        log: () => undefined
      }
    );
    await advanceShortsSchedule(
      { db: opened.db, key: Buffer.alloc(32), mediaDir: opened.dir, publicBase: "http://127.0.0.1:4180" },
      {
        now: at("2026-11-17", "15:10"),
        submitBrief: async () => "run-again",
        downloadFinal: async () => ({ filename: "ready.mp4" }),
        publish: async () => ({ id: "job-product", status: "published", remotePostId: "vid123", remoteUrl: "https://youtu.be/vid123" }),
        comment: async (_videoId, text) => { comments.push(text); },
        log: () => undefined
      }
    );
    expect(comments).toHaveLength(1);
    expect(comments[0]).toContain("https://reelmino.com");
    expect(comments[0]).toMatch(/bakery in tel aviv|family restaurant|apartment|gym|salon|online shop/i);
  });
});
