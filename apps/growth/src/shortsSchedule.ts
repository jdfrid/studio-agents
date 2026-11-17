import { evaluateShortsGate, nextSeriesTopic } from "@studio/shared";
import { slugify } from "./catalog.js";
import { emptyCopy } from "./copy.js";
import { nid } from "./crypto.js";
import {
  destinationsForNetwork,
  getSetting,
  insertItem,
  updateItem,
  type Destination,
  type GrowthDb
} from "./db.js";
import { downloadReelminoFinal, submitReelminoBrief } from "./produce.js";
import { contentForTrend } from "./youtubeTrends.js";
import { runPublish } from "./publish.js";
import { countShortsToday, readShortsDailyCap, recentChannelPosts } from "./shortsGate.js";
import { zonedToUtc } from "./time.js";

export const SHORTS_TIMEZONE = "Asia/Jerusalem";
export const SHORTS_LEAD_MINUTES = 90;
export const SHORTS_MAX_ATTEMPTS = 3;
export const KITCHEN_CHANNEL_ID = "UCsKPN8oZJOPM4KJC4bN_ANw";
export const REELMINO_CHANNEL_ID = "UC3iee8PYICmnfO5s8viJgkQ";

const KITCHEN_TIMES = ["15:00", "19:00", "23:00"];
const PRODUCT_TIMES = ["16:00", "21:00"];
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ScheduleKind = "kitchen" | "product";

export type SlotAction = "wait" | "skip" | "start" | "poll" | "upload" | "regenerate";

export type SlotDecision = { action: SlotAction; reason: string };

type SlotRow = {
  slotKey: string;
  destinationId: string;
  publishAt: string;
  status: string;
  attempts: number;
  title: string;
  itemId: string | null;
  runId: string | null;
  jobId: string | null;
  error: string | null;
};

export type ScheduleContext = {
  db: GrowthDb;
  key: Buffer;
  mediaDir: string;
  publicBase: string;
};

export type ScheduleDeps = {
  now?: Date;
  submitBrief?: (brief: Record<string, unknown>) => Promise<string>;
  downloadFinal?: typeof downloadReelminoFinal;
  publish?: (
    itemId: string,
    destination: Destination,
    publishAt: Date | null
  ) => Promise<{ id: string; status: string; lastError?: string | null; errorCode?: string | null; remoteUrl?: string | null }>;
  log?: (message: string) => void;
};

export function parseClockList(raw: string | undefined | null, fallback: string[]): string[] {
  const clocks = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => CLOCK.test(part));
  const unique = [...new Set(clocks)].sort();
  return unique.length ? unique : [...fallback];
}

export function scheduleTimezone(): string {
  const zone = process.env.SHORTS_TIMEZONE?.trim();
  if (!zone) return SHORTS_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return SHORTS_TIMEZONE;
  }
}

export function leadMinutes(): number {
  const parsed = Number(process.env.SHORTS_LEAD_MINUTES);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 24 * 60) return parsed;
  return SHORTS_LEAD_MINUTES;
}

export function scheduleFor(kind: ScheduleKind): string[] {
  const raw = kind === "kitchen" ? process.env.SHORTS_SCHEDULE_KITCHEN : process.env.SHORTS_SCHEDULE_REELMINO;
  return parseClockList(raw, kind === "kitchen" ? KITCHEN_TIMES : PRODUCT_TIMES);
}

export function scheduledChannel(destination: { externalId?: string | null; handle?: string | null; name?: string | null; url?: string | null }): ScheduleKind | null {
  const id = destination.externalId ?? "";
  const blob = `${destination.handle ?? ""} ${destination.name ?? ""} ${destination.url ?? ""}`;
  if (id === KITCHEN_CHANNEL_ID || /kitchentips/i.test(blob)) return "kitchen";
  if (id === REELMINO_CHANNEL_ID || /reelminoapp/i.test(blob)) return "product";
  return null;
}

export function slotInstant(day: string, hhmm: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  return zonedToUtc(year ?? 1970, month ?? 1, date ?? 1, hour ?? 0, minute ?? 0, timeZone);
}

export function localDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function slotKey(channelId: string, day: string, hhmm: string): string {
  return `shorts:${channelId}:${day}:${hhmm}`;
}

export function decideSlot(input: {
  now: Date;
  publishAt: Date;
  leadAt: Date;
  status: string | null;
  attempts: number;
  fileReady: boolean;
  gateFailed: boolean;
  publishedToday: number;
  dailyCap: number;
  maxAttempts?: number;
}): SlotDecision {
  const maxAttempts = input.maxAttempts ?? SHORTS_MAX_ATTEMPTS;
  const status = input.status;
  if (status === "published" || status === "publishing" || status === "skipped") return { action: "wait", reason: "" };
  if (input.dailyCap <= 0) {
    if (!status && input.now.getTime() > input.publishAt.getTime()) {
      return { action: "skip", reason: "channel paused (SHORTS_DAILY_CAP=0)" };
    }
    return { action: "wait", reason: "channel paused (SHORTS_DAILY_CAP=0)" };
  }
  if (!status && input.now.getTime() > input.publishAt.getTime()) return { action: "skip", reason: "missed slot" };
  if (!status && input.now.getTime() < input.leadAt.getTime()) return { action: "wait", reason: "" };
  if (!status && input.publishedToday >= input.dailyCap) return { action: "skip", reason: "daily cap" };
  if (!status) return { action: "start", reason: "" };
  if (input.gateFailed && input.attempts >= maxAttempts) return { action: "skip", reason: "quality gate failed" };
  if (input.gateFailed) return { action: "regenerate", reason: "quality gate failed" };
  if (!input.fileReady) return { action: "poll", reason: "" };
  return { action: "upload", reason: "" };
}

export function briefForScheduledShort(input: {
  kind: ScheduleKind;
  recentTitles: string[];
  salt?: number;
}): { title: string; summary: string; description: string; brief: Record<string, unknown> } | null {
  const series = nextSeriesTopic({
    kind: input.kind,
    language: "en",
    recentTitles: input.recentTitles,
    salt: input.salt ?? input.recentTitles.length
  });
  if (!series) return null;
  const content = contentForTrend({
    topic: series.title,
    niche: input.kind === "kitchen" ? "home cooking, food storage, kitchen layout" : "small business video",
    language: "en",
    durationSeconds: 20,
    channel: input.kind,
    hook: series.hook,
    angle: series.angle
  });
  const guard = input.kind === "product"
    ? " This channel is the product channel. Do not make a kitchen, recipe, or food-storage video. No trailers, no third-party characters, and no logos you do not own."
    : " This channel is kitchen tips. Do not mention the product pitch, trailers, or third-party characters and logos.";
  content.brief.instructions = `${String(content.brief.instructions ?? "")}${guard}`;
  content.brief.approvalMode = "auto";
  return content;
}

export async function advanceShortsSchedule(ctx: ScheduleContext, deps: ScheduleDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const zone = scheduleTimezone();
  const lead = leadMinutes();
  const day = localDay(now, zone);
  const cap = readShortsDailyCap(ctx.db);
  for (const destination of destinationsForNetwork(ctx.db, "youtube")) {
    if (!destination.enabled || destination.kind !== "channel") continue;
    const kind = scheduledChannel(destination);
    if (!kind) continue;
    const publishedToday = countShortsToday(ctx.db, destination.id, now);
    for (const hhmm of scheduleFor(kind)) {
      const publishAt = slotInstant(day, hhmm, zone);
      const leadAt = new Date(publishAt.getTime() - lead * 60_000);
      const key = slotKey(destination.externalId || destination.id, day, hhmm);
      await runSlot(ctx, deps, { destination, kind, now, publishAt, leadAt, key, cap, publishedToday });
    }
  }
}

async function runSlot(
  ctx: ScheduleContext,
  deps: ScheduleDeps,
  input: {
    destination: Destination;
    kind: ScheduleKind;
    now: Date;
    publishAt: Date;
    leadAt: Date;
    key: string;
    cap: number;
    publishedToday: number;
  }
): Promise<void> {
  const row = readSlot(ctx.db, input.key);
  const gateFailed = row?.status === "failed";
  const decision = decideSlot({
    now: input.now,
    publishAt: input.publishAt,
    leadAt: input.leadAt,
    status: row?.status ?? null,
    attempts: row?.attempts ?? 0,
    fileReady: false,
    gateFailed,
    publishedToday: input.publishedToday,
    dailyCap: input.cap
  });
  if (decision.action === "wait") return;
  if (decision.action === "skip") {
    writeSlot(ctx.db, {
      slotKey: input.key,
      destinationId: input.destination.id,
      publishAt: input.publishAt.toISOString(),
      status: "skipped",
      attempts: row?.attempts ?? 0,
      title: row?.title ?? "",
      itemId: row?.itemId ?? null,
      runId: row?.runId ?? null,
      jobId: row?.jobId ?? null,
      error: decision.reason
    });
    log(deps, `${input.key} skipped: ${decision.reason}`);
    return;
  }
  if (decision.action === "start" || decision.action === "regenerate") {
    await startAttempt(ctx, deps, input, row);
    return;
  }
  if (decision.action !== "poll" && decision.action !== "upload") return;
  if (!row?.runId || !row.itemId) return;
  const file = await (deps.downloadFinal ?? downloadReelminoFinal)(row.runId, ctx.mediaDir);
  if (!file) return;
  const item = updateItem(ctx.db, row.itemId, {
    mediaPath: file.filename,
    mediaMime: "video/mp4",
    mediaKind: "video",
    mediaWidth: 1080,
    mediaHeight: 1920,
    mediaDurationMs: 20_000,
    ...(file.narration ? { copy: withNarration(ctx.db, row.itemId, file.narration) } : {})
  });
  if (!item) return;
  const publishAt = input.publishAt.getTime() > input.now.getTime() + 60_000 ? input.publishAt : null;
  const result = deps.publish
    ? await deps.publish(item.id, input.destination, publishAt)
    : await runPublish({
        db: ctx.db,
        key: ctx.key,
        mediaDir: ctx.mediaDir,
        publicBase: ctx.publicBase,
        item,
        destination: input.destination,
        publishAt,
        campaign: getSetting(ctx.db, "utm_campaign") ?? undefined
      });
  const gateCode = result.errorCode === "shorts_quality" || result.errorCode === "shorts_review" || result.errorCode === "shorts_daily_cap";
  if (result.status === "failed" && gateCode) {
    const attempts = row.attempts;
    writeSlot(ctx.db, { ...row, status: "failed", error: result.lastError ?? "quality gate", jobId: result.id });
    log(deps, `${input.key} gate rejected attempt ${attempts}: ${result.lastError ?? "quality gate"}`);
    if (attempts < SHORTS_MAX_ATTEMPTS && result.errorCode !== "shorts_daily_cap") {
      await startAttempt(ctx, deps, input, readSlot(ctx.db, input.key));
    } else if (attempts >= SHORTS_MAX_ATTEMPTS) {
      writeSlot(ctx.db, { ...(readSlot(ctx.db, input.key) ?? row), status: "skipped", error: result.lastError ?? "quality gate" });
      log(deps, `${input.key} skipped after ${attempts} attempts`);
    }
    return;
  }
  if (result.status === "failed") {
    writeSlot(ctx.db, { ...row, status: "failed", error: result.lastError ?? "upload failed", jobId: result.id });
    log(deps, `${input.key} upload failed: ${result.lastError ?? "upload failed"}`);
    return;
  }
  writeSlot(ctx.db, {
    ...row,
    status: result.status === "published" || result.status === "draft" ? "published" : "publishing",
    jobId: result.id,
    error: null
  });
}

async function startAttempt(
  ctx: ScheduleContext,
  deps: ScheduleDeps,
  input: {
    destination: Destination;
    kind: ScheduleKind;
    publishAt: Date;
    key: string;
  },
  existing: SlotRow | null
): Promise<void> {
  const attempts = (existing?.attempts ?? 0) + 1;
  if (attempts > SHORTS_MAX_ATTEMPTS) {
    writeSlot(ctx.db, {
      slotKey: input.key,
      destinationId: input.destination.id,
      publishAt: input.publishAt.toISOString(),
      status: "skipped",
      attempts: existing?.attempts ?? SHORTS_MAX_ATTEMPTS,
      title: existing?.title ?? "",
      itemId: existing?.itemId ?? null,
      runId: existing?.runId ?? null,
      jobId: existing?.jobId ?? null,
      error: existing?.error ?? "quality gate failed"
    });
    log(deps, `${input.key} skipped after ${existing?.attempts ?? SHORTS_MAX_ATTEMPTS} attempts`);
    return;
  }
  const recent = [
    ...recentChannelPosts(ctx.db, input.destination.id).map((post) => post.title),
    ...recentSlotTitles(ctx.db, input.destination.id)
  ];
  let built = briefForScheduledShort({ kind: input.kind, recentTitles: recent, salt: attempts });
  let gateError = "";
  if (built) {
    const script = [String(built.brief.sourceText ?? ""), built.summary].join("\n");
    const gate = evaluateShortsGate({
      mode: "plan",
      title: built.title,
      description: built.description,
      script,
      language: "en",
      durationSeconds: 20,
      channel: input.kind,
      recent: recentChannelPosts(ctx.db, input.destination.id),
      publishedToday: countShortsToday(ctx.db, input.destination.id),
      dailyCap: readShortsDailyCap(ctx.db)
    });
    if (gate.decision !== "publish") {
      built = null;
      gateError = gate.reasons.join(" ");
    }
  }
  if (!built) {
    const failed: SlotRow = {
      slotKey: input.key,
      destinationId: input.destination.id,
      publishAt: input.publishAt.toISOString(),
      status: "failed",
      attempts,
      title: existing?.title ?? "",
      itemId: null,
      runId: null,
      jobId: null,
      error: gateError || "no fresh topic"
    };
    writeSlot(ctx.db, failed);
    log(deps, `${input.key} attempt ${attempts} rejected: ${failed.error}`);
    if (attempts < SHORTS_MAX_ATTEMPTS) await startAttempt(ctx, deps, input, failed);
    else {
      writeSlot(ctx.db, { ...failed, status: "skipped" });
      log(deps, `${input.key} skipped after ${attempts} attempts`);
    }
    return;
  }
  const item = insertItem(ctx.db, {
    id: nid(),
    slug: slugify(`${input.key}-${attempts}`),
    source: "shorts-schedule",
    title: built.title,
    summary: built.summary,
    language: "en",
    copy: scheduleCopy(built.title, built.description),
    mediaPath: null,
    mediaMime: null,
    mediaKind: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationMs: 20_000,
    reelminoRunId: null
  });
  try {
    const runId = await (deps.submitBrief ?? submitReelminoBrief)(built.brief);
    updateItem(ctx.db, item.id, { reelminoRunId: runId });
    writeSlot(ctx.db, {
      slotKey: input.key,
      destinationId: input.destination.id,
      publishAt: input.publishAt.toISOString(),
      status: "producing",
      attempts,
      title: built.title,
      itemId: item.id,
      runId,
      jobId: null,
      error: null
    });
    log(deps, `${input.key} producing attempt ${attempts}: ${built.title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed: SlotRow = {
      slotKey: input.key,
      destinationId: input.destination.id,
      publishAt: input.publishAt.toISOString(),
      status: "failed",
      attempts,
      title: built.title,
      itemId: item.id,
      runId: null,
      jobId: null,
      error: message
    };
    writeSlot(ctx.db, failed);
    log(deps, `${input.key} attempt ${attempts} failed: ${message}`);
    if (attempts < SHORTS_MAX_ATTEMPTS) await startAttempt(ctx, deps, input, failed);
  }
}

function withNarration(db: GrowthDb, itemId: string, narration: string) {
  const row = db.prepare("SELECT copy_json FROM items WHERE id = ?").get(itemId) as { copy_json?: string } | undefined;
  const copy = emptyCopy();
  try {
    Object.assign(copy, JSON.parse(row?.copy_json || "{}"));
  } catch {
    /* keep the empty copy */
  }
  copy.article = { ...copy.article, body: narration };
  return copy;
}

function scheduleCopy(title: string, description: string) {
  const copy = emptyCopy();
  copy.youtube = { title, body: description };
  copy.article = { title, description, body: description };
  return copy;
}

function recentSlotTitles(db: GrowthDb, destinationId: string): string[] {
  const rows = db
    .prepare("SELECT title FROM shorts_slots WHERE destination_id = ? AND title != '' ORDER BY updated_at DESC LIMIT 20")
    .all(destinationId) as Array<{ title?: string }>;
  return rows.map((row) => row.title ?? "").filter(Boolean);
}

function readSlot(db: GrowthDb, slotKey: string): SlotRow | null {
  const row = db.prepare("SELECT * FROM shorts_slots WHERE slot_key = ?").get(slotKey) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    slotKey: String(row.slot_key ?? ""),
    destinationId: String(row.destination_id ?? ""),
    publishAt: String(row.publish_at ?? ""),
    status: String(row.status ?? ""),
    attempts: Number(row.attempts ?? 0),
    title: String(row.title ?? ""),
    itemId: row.item_id ? String(row.item_id) : null,
    runId: row.run_id ? String(row.run_id) : null,
    jobId: row.job_id ? String(row.job_id) : null,
    error: row.error ? String(row.error) : null
  };
}

function writeSlot(db: GrowthDb, row: SlotRow): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO shorts_slots (slot_key, destination_id, publish_at, status, attempts, title, item_id, run_id, job_id, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slot_key) DO UPDATE SET
       status = excluded.status,
       attempts = excluded.attempts,
       title = excluded.title,
       item_id = excluded.item_id,
       run_id = excluded.run_id,
       job_id = excluded.job_id,
       error = excluded.error,
       updated_at = excluded.updated_at`
  ).run(
    row.slotKey,
    row.destinationId,
    row.publishAt,
    row.status,
    row.attempts,
    row.title,
    row.itemId,
    row.runId,
    row.jobId,
    row.error,
    now,
    now
  );
}

function log(deps: ScheduleDeps, message: string): void {
  if (deps.log) deps.log(message);
  else console.log(`[shorts-schedule] ${message}`);
}
