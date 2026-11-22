import { estimateSpokenSeconds, evaluateShortsGate, fitShortScript, followWinner, kitchenRelevantPhrase, KITCHEN_SERIES, KITCHEN_WINNER_SEED, nextProductDemo, nextSeriesTopic, seriesEpisode, seriesForTopic, seriesTitle, subscribeLine, subscribeUrl, titleFromScript, type ProductDemo, type TopicScore } from "@studio/shared";
import { promoCommentText, savedPromo } from "./promoLinks.js";
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
  updatedAt?: string | null;
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
  ) => Promise<{ id: string; status: string; lastError?: string | null; errorCode?: string | null; remoteUrl?: string | null; remotePostId?: string | null }>;
  comment?: (videoId: string, text: string) => Promise<void>;
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
  updatedAt?: Date | null;
  produceTimeoutMs?: number;
}): SlotDecision {
  const maxAttempts = input.maxAttempts ?? SHORTS_MAX_ATTEMPTS;
  const status = input.status;
  const timeoutMs = input.produceTimeoutMs ?? 90 * 60 * 1000;
  if (status === "producing" && input.updatedAt && input.now.getTime() - input.updatedAt.getTime() > timeoutMs) {
    if (input.attempts >= maxAttempts) return { action: "skip", reason: "production timed out" };
    return { action: "regenerate", reason: "production timed out" };
  }
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
  recentDemos?: Array<{ featureId?: string; businessId?: string; title?: string; script?: string }>;
  salt?: number;
  demandPhrase?: string;
  multipliers?: Record<string, number>;
  winners?: string[];
  channelId?: string;
}): { title: string; summary: string; description: string; brief: Record<string, unknown>; demo?: ProductDemo } | null {
  if (input.kind === "product") {
    const winner = followWinner(input.salt ?? 0) ? input.winners?.[0] : undefined;
    const demo = nextProductDemo({
      recent: input.recentDemos ?? input.recentTitles.map((title) => ({ title })),
      salt: input.salt,
      multipliers: input.multipliers,
      preferredFeatureId: winner
    });
    if (!demo) return null;
    const content = contentForTrend({
      topic: demo.title,
      niche: "small business owners",
      language: "en",
      durationSeconds: 20,
      channel: "product",
      hook: demo.prompt,
      angle: demo.featureName
    });
    content.title = demo.title;
    content.summary = `${demo.featureName} for a ${demo.businessLabel}.`;
    content.description = withSubscribeLink(demo.description, input.channelId);
    content.brief.title = demo.title;
    content.brief.sourceText = fitShortScript(demo.script, "product", { subscribe: subscribeCtaOn() });
    content.brief.durationSeconds = 20;
    content.brief.instructions = `${String(content.brief.instructions ?? "")} Follow the source text as the narration and do not add sentences. Speak at most 40 words. The last spoken line before the loop is exactly: Try it with your sentence - link in pinned comment. The finished file, including the end card, must stay under 25 seconds. This channel is the product channel. Do not make a kitchen, recipe, or food-storage video. No trailers, no third-party characters, and no logos you do not own.`;
    content.brief.resultSegment = {
      source: "veo-stand-in",
      examplePrompt: demo.prompt,
      featureId: demo.featureId,
      businessId: demo.businessId,
      swapLater: true
    };
    content.brief.approvalMode = "auto";
    return { ...content, demo };
  }
  const demand = input.demandPhrase?.trim();
  const demandOk = Boolean(demand && kitchenRelevantPhrase(demand) && !input.recentTitles.some((title) => title.toLowerCase().includes(demand.toLowerCase().slice(0, 24))));
  const series = nextSeriesTopic({
    kind: input.kind,
    language: "en",
    recentTitles: input.recentTitles,
    salt: input.salt ?? input.recentTitles.length,
    multipliers: input.multipliers,
    winners: input.winners,
    preferWinner: followWinner(input.salt ?? 0)
  });
  if (!series) return null;
  const named = seriesForTopic(series.id);
  const script = fitShortScript([series.hook, series.angle, series.hook].join("\n"), "kitchen", { subscribe: subscribeCtaOn() });
  const plain = titleFromScript(script, series.title);
  const title = named ? seriesTitle(named.name, seriesEpisode(named.name, input.recentTitles), plain) : plain;
  const content = contentForTrend({
    topic: title,
    niche: "home cooking, food storage, kitchen layout",
    language: "en",
    durationSeconds: 20,
    channel: "kitchen",
    hook: series.hook,
    angle: demandOk ? demand : series.angle
  });
  content.title = title;
  content.brief.title = title;
  content.brief.sourceText = script;
  content.brief.durationSeconds = 20;
  content.description = withSubscribeLink(content.description, input.channelId);
  content.brief.instructions = `${String(content.brief.instructions ?? "")} Follow the source text as the narration and do not add sentences. Speak at most 40 words. The finished file, including the end card, must stay under 25 seconds. This channel is kitchen tips. Do not mention the product pitch, trailers, or third-party characters and logos.`;
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
      if (longFormReplacesShort(kind, hhmm, now, zone)) {
        const existing = readSlot(ctx.db, key);
        const decision = decideSlot({
          now,
          publishAt,
          leadAt,
          status: existing?.status ?? null,
          attempts: existing?.attempts ?? 0,
          updatedAt: existing?.updatedAt ? new Date(existing.updatedAt) : null,
          fileReady: false,
          gateFailed: existing?.status === "failed",
          publishedToday,
          dailyCap: cap
        });
        if (decision.action === "start" || decision.action === "regenerate") {
          writeSlot(ctx.db, {
            slotKey: key,
            destinationId: destination.id,
            publishAt: publishAt.toISOString(),
            status: "skipped",
            attempts: existing?.attempts ?? 0,
            title: existing?.title ?? "",
            itemId: existing?.itemId ?? null,
            runId: existing?.runId ?? null,
            jobId: existing?.jobId ?? null,
            error: "replaced by the weekly tutorial"
          });
          log(deps, `${key} skipped: weekly tutorial uses this slot`);
          continue;
        }
      }
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
    updatedAt: row?.updatedAt ? new Date(row.updatedAt) : null,
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
  const narration = file.narration ? fitShortScript(file.narration, input.kind, { subscribe: subscribeCtaOn() }) : "";
  const item = updateItem(ctx.db, row.itemId, {
    mediaPath: file.filename,
    mediaMime: "video/mp4",
    mediaKind: "video",
    mediaWidth: 1080,
    mediaHeight: 1920,
    mediaDurationMs: 20_000,
    ...(narration ? { title: titleFromScript(narration, row.title), copy: withNarration(ctx.db, row.itemId, narration) } : {})
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
  await postPromoComment(ctx, deps, input.destination, input.kind, result.remotePostId, item);
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
  const posts = recentChannelPosts(ctx.db, input.destination.id);
  const recent = [...posts.map((post) => post.title), ...recentSlotTitles(ctx.db, input.destination.id)];
  let built: ReturnType<typeof briefForScheduledShort> = null;
  let gateError = "";
  for (let step = 0; step < 6 && !built; step += 1) {
    const candidate = briefForScheduledShort({
      kind: input.kind,
      recentTitles: recent,
      recentDemos: posts,
      salt: attempts + step,
      demandPhrase: step === 0 && input.kind === "kitchen" ? readDemandPhrase(ctx.db, "kitchen") : undefined,
      multipliers: readWeightMap(ctx.db, input.kind),
      winners: readWinnerIds(ctx.db, input.kind),
      channelId: input.destination.externalId
    });
    if (!candidate) {
      gateError = "no fresh topic";
      continue;
    }
    const script = fitShortScript(String(candidate.brief.sourceText ?? candidate.summary), input.kind, { subscribe: subscribeCtaOn() });
    candidate.brief.sourceText = script;
    candidate.brief.durationSeconds = 20;
    const prefixed = KITCHEN_SERIES.some((series) => candidate.title.toLowerCase().startsWith(`${series.name.toLowerCase()} #`));
    const ownTitle = prefixed ? candidate.title : titleFromScript(script, candidate.title);
    candidate.title = ownTitle;
    candidate.brief.title = ownTitle;
    const spoken = estimateSpokenSeconds(script);
    const gate = evaluateShortsGate({
      mode: "plan",
      title: ownTitle,
      description: candidate.description,
      script,
      language: "en",
      durationSeconds: 20,
      channel: input.kind,
      requireProductDemo: input.kind === "product",
      recent: posts,
      publishedToday: countShortsToday(ctx.db, input.destination.id),
      dailyCap: readShortsDailyCap(ctx.db)
    });
    if (gate.decision === "publish" && spoken <= 22) built = candidate;
    else gateError = gate.reasons.join(" ") || "script is too long to speak in 20 seconds";
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
    copy: scheduleCopy(built.title, built.description, String(built.brief.sourceText ?? built.summary)),
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

function scheduleCopy(title: string, description: string, script = "") {
  const copy = emptyCopy();
  copy.youtube = { title, body: description };
  copy.article = { title, description, body: script || description };
  return copy;
}

async function postPromoComment(
  ctx: ScheduleContext,
  deps: ScheduleDeps,
  destination: Destination,
  kind: ScheduleKind,
  videoId: string | null | undefined,
  item: { id: string; title?: string; language: string; copy: { article?: { body?: string } } }
): Promise<void> {
  const promo = promoCommentText({
    kind,
    script: item.copy.article?.body || "",
    language: item.language,
    promo: savedPromo(ctx.db, item.id)
  });
  const ctaOn = subscribeCtaOn();
  const guide = getSetting(ctx.db, `longform_url:${destination.id}`);
  const series = getSetting(ctx.db, `longform_series:${destination.id}`)?.toLowerCase() ?? "";
  const title = (item.title ?? "").toLowerCase();
  const guideLine = guide && series && title.includes(series) ? `Full guide: ${guide}` : "";
  const text = [promo, guideLine, ctaOn ? subscribeLine(kind) : "", ctaOn ? subscribeUrl(destination.externalId) : ""].filter(Boolean).join("\n");
  if (!text) return;
  if (!videoId) {
    log(deps, "promo comment waiting for a YouTube video id. Pinning is not available in the YouTube API.");
    return;
  }
  try {
    if (deps.comment) {
      await deps.comment(videoId, text);
      return;
    }
    const { freshConnectionTokens } = await import("./publish.js");
    const { postYoutubeComment } = await import("@studio/providers");
    const tokens = await freshConnectionTokens(ctx.db, destination.connectionId, ctx.key, "youtube");
    await postYoutubeComment(tokens.accessToken, videoId, text);
    log(deps, `${videoId} comment posted. YouTube's API cannot pin it; pin that comment in Studio.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(deps, `product comment failed: ${message}. Pinning remains a Studio step.`);
  }
}

function readWeightMap(db: GrowthDb, kind: string): Record<string, number> {
  const raw = getSetting(db, `weights:${kind}`);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function subscribeCtaOn(): boolean {
  const raw = process.env.SHORTS_SUBSCRIBE_CTA?.trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function withSubscribeLink(description: string, channelId?: string): string {
  if (!channelId || !subscribeCtaOn() || description.includes("sub_confirmation=1")) return description;
  return `${description}\n\nSubscribe: ${subscribeUrl(channelId)}`.trim();
}

export function longFormReplacesShort(kind: ScheduleKind, hhmm: string, now: Date, zone: string): boolean {
  const longOff = ["0", "false", "off", "no"].includes(process.env.SHORTS_LONGFORM?.trim().toLowerCase() ?? "");
  const replaceOff = ["0", "false", "off", "no"].includes(process.env.SHORTS_LONGFORM_REPLACES_SHORT?.trim().toLowerCase() ?? "");
  if (longOff || replaceOff) return false;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(now);
  if (kind === "kitchen") return weekday === "Tue" && hhmm === "19:00";
  return weekday === "Thu" && hhmm === "16:00";
}

function readWinnerIds(db: GrowthDb, kind: ScheduleKind): string[] {
  const raw = getSetting(db, `winners:${kind}`);
  const fallback = kind === "kitchen" ? KITCHEN_WINNER_SEED : [];
  try {
    const parsed = raw ? (JSON.parse(raw) as TopicScore[]) : fallback;
    return (Array.isArray(parsed) ? parsed : fallback).map((row) => row.topicId).filter(Boolean);
  } catch {
    return fallback.map((row) => row.topicId);
  }
}

function readDemandPhrase(db: GrowthDb, kind: string): string | undefined {
  const raw = getSetting(db, `demand:${kind}`);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Array<{ phrase?: string }>;
    return parsed.find((item) => item.phrase && (kind !== "kitchen" || kitchenRelevantPhrase(item.phrase)))?.phrase;
  } catch {
    return undefined;
  }
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
    error: row.error ? String(row.error) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null
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
