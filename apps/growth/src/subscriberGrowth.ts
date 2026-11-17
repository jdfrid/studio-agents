import { KITCHEN_TOPICS, PRODUCT_BUSINESSES, PRODUCT_FEATURES, type ShortsChannelKind } from "@studio/shared";
import { destinationsForNetwork, getItem, getSetting, insertItem, setSetting, updateItem, type Destination, type GrowthDb } from "./db.js";
import { nid } from "./crypto.js";
import { emptyCopy } from "./copy.js";
import { freshConnectionTokens, runPublish } from "./publish.js";
import { downloadReelminoFinal, submitReelminoBrief } from "./produce.js";
import { KITCHEN_CHANNEL_ID, REELMINO_CHANNEL_ID, scheduledChannel } from "./shortsSchedule.js";

export const COMMENT_DAILY_CAP = 30;
export const COMMENT_SCAN_MS = 2 * 60 * 60 * 1000;

const SPAM = /\b(followers|sub4sub|crypto|giveaway|click here|whatsapp|telegram me|onlyfans)\b/i;
const ABUSE = /\b(idiot|stupid|hate you|kill|scam|fraud)\b/i;
const COMPLAINT = /\b(worst|terrible|awful|refund|waste of time|doesn't work|does not work|broken)\b/i;
const POLITICAL = /\b(election|democrat|republican|trump|biden|netanyahu|gaza|palestine|israel politics)\b/i;
const PRAISE = /\b(love|thanks|thank you|great|helpful|awesome|nice|wow|amazing)\b/i;

export function growthFlag(name: string, defaultOn = true): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultOn;
  return !["0", "false", "off", "no"].includes(raw);
}

export type PlaylistSpec = { key: string; title: string; description: string };

const KITCHEN_PLAYLISTS: Array<PlaylistSpec & { match: RegExp }> = [
  { key: "produce", title: "Keep produce fresh", description: "How to keep fruit and vegetables crisp for longer.", match: /produce|lettuce|crisp|fruit|vegetable/i },
  { key: "herbs", title: "Keep fresh herbs alive", description: "Stop herbs turning to mush. One storage fix per video.", match: /herb/i },
  { key: "storage", title: "Food storage that works", description: "Leftovers, fridge layout, and containers that actually keep food.", match: /storage|leftover|fridge/i },
  { key: "cleaning", title: "Kitchen cleaning shortcuts", description: "Fast cleaning fixes for a home kitchen.", match: /clean/i },
  { key: "hacks", title: "Cooking hacks", description: "Small kitchen layout and everyday cooking shortcuts.", match: /hack|layout|counter|pan/i }
];

export function playlistForKitchen(title: string): PlaylistSpec {
  return KITCHEN_PLAYLISTS.find((row) => row.match.test(title)) ?? {
    key: "hacks",
    title: "Cooking hacks",
    description: "Small kitchen layout and everyday cooking shortcuts."
  };
}

export function playlistsForProduct(featureId: string, businessId: string): PlaylistSpec[] {
  const feature = PRODUCT_FEATURES.find((item) => item.id === featureId) ?? PRODUCT_FEATURES[0];
  const business = PRODUCT_BUSINESSES.find((item) => item.id === businessId) ?? PRODUCT_BUSINESSES[0];
  if (!feature || !business) return [];
  return [
    {
      key: `feature:${feature.id}`,
      title: feature.name[0] ? feature.name[0].toUpperCase() + feature.name.slice(1) : feature.name,
      description: `Reelmino shorts about ${feature.name}. One business example in every video.`
    },
    {
      key: `business:${business.id}`,
      title: `Reelmino for ${business.label}`,
      description: `How a ${business.label} can turn one sentence into a branded video with Reelmino.`
    }
  ];
}

export function crossPostCaption(title: string, channelUrl: string): string {
  return `${title.trim()}\n\nFull channel on YouTube\n${channelUrl}`.trim();
}

export function crossPostTargets(): { buffer: boolean; tiktok: boolean; instagram: boolean; facebook: boolean } {
  return {
    buffer: Boolean(process.env.BUFFER_ACCESS_TOKEN?.trim() && process.env.BUFFER_CHANNEL_ID?.trim()),
    tiktok: Boolean(process.env.TIKTOK_ACCESS_TOKEN?.trim()),
    instagram: Boolean(process.env.INSTAGRAM_ACCOUNT_ID?.trim() && process.env.INSTAGRAM_ACCESS_TOKEN?.trim()),
    facebook: Boolean(process.env.FACEBOOK_PAGE_ID?.trim() && process.env.FACEBOOK_PAGE_TOKEN?.trim())
  };
}

export function commentDecision(text: string): "reply" | "skip" {
  const body = text.replace(/\s+/g, " ").trim();
  if (body.length < 2) return "skip";
  if (SPAM.test(body) || ABUSE.test(body) || COMPLAINT.test(body) || POLITICAL.test(body)) return "skip";
  if (body.includes("?") || PRAISE.test(body)) return "reply";
  const words = body.split(" ").filter(Boolean);
  return words.length >= 4 ? "reply" : "skip";
}

export function finishReply(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean) return "What part should I show next?";
  return /[?؟]$/.test(clean) ? clean : `${clean.replace(/[.!]$/, "")}?`.slice(0, 200);
}

export function replyAllowsLink(text: string, product: boolean): boolean {
  return product && /\b(how|try|where|link|website|start)\b/i.test(text);
}

export function tuneMultiplier(input: { views: number; viewRatio: number; subs: number; medianViews: number }): number {
  const views = input.medianViews > 0 ? input.views / input.medianViews : 1;
  const ratio = input.viewRatio > 0 ? input.viewRatio / 50 : 1;
  const subs = input.subs > 0 ? 1.15 : 0.9;
  const raw = views * 0.5 + ratio * 0.3 + subs * 0.2;
  return Math.min(2, Math.max(0.5, Math.round(raw * 100) / 100));
}

export function rankDemand(titles: string[]): Array<{ phrase: string; score: number }> {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const phrase = title.replace(/\s+/g, " ").trim();
    if (phrase.length < 8) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([phrase, score]) => ({ phrase, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export type LongFormGateResult = { ok: boolean; reasons: string[] };

export function evaluateLongForm(input: { title: string; description: string; script: string; durationSeconds: number }): LongFormGateResult {
  const reasons: string[] = [];
  const title = input.title.replace(/\s+/g, " ").trim();
  if (title.length < 8 || title.length > 70) reasons.push("Title must be a search phrase of 8 to 70 characters.");
  if (/^(welcome|hey|hi)\b/i.test(input.script.trim())) reasons.push("Do not open with a greeting.");
  const chapters = input.description.match(/^\d+:\d{2}\s+\S/gm) ?? [];
  if (chapters.length < 3) reasons.push("Description needs at least three chapters.");
  const subscribes = input.script.match(/\bsubscribe\b/gi) ?? [];
  if (subscribes.length < 2) reasons.push("Say subscribe once in the middle and once at the end.");
  if (input.durationSeconds < 180 || input.durationSeconds > 360) reasons.push("Length must be 3 to 6 minutes.");
  return { ok: reasons.length === 0, reasons };
}

export function longFormPackage(input: { kind: ShortsChannelKind; topic: string; parts: string[]; playlistUrl?: string }): {
  title: string;
  description: string;
  script: string;
  durationSeconds: number;
} {
  const topic = input.topic.replace(/\s+/g, " ").trim();
  const title = input.kind === "kitchen"
    ? `${Math.max(3, input.parts.length)} tricks to ${topic}`.slice(0, 70)
    : `Reelmino for ${topic}: the full walkthrough`.slice(0, 70);
  const steps = input.parts.length ? input.parts : ["Show the problem", "Do the fix", "Show the result"];
  const chapters = steps.map((step, index) => `${index}:00 ${step}`).join("\n");
  const playlist = input.playlistUrl ? `\n\nShorts in this series: ${input.playlistUrl}` : "";
  const description = `${title}.\n\n${chapters}${playlist}`;
  const mid = steps[Math.floor(steps.length / 2)] ?? steps[0];
  const script = [
    `${topic} is the whole video.`,
    ...steps.map((step) => `${step}.`),
    `If ${mid} helped, subscribe for the next one.`,
    `That is the last step. Subscribe and tell me which one you will try.`
  ].join("\n");
  return { title, description, script, durationSeconds: 240 };
}

export function sundaySlot(now: Date, timeZone: string, hour = 18, minute = 0): { key: string; at: Date; leadAt: Date; graceEnd: Date } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const delta = index === 0 ? 0 : -index;
  const sunday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + delta));
  const sundayDay = sunday.toISOString().slice(0, 10);
  const at = zoned(sundayDay, hour, minute, timeZone);
  return {
    key: `longform:${sundayDay}`,
    at,
    leadAt: new Date(at.getTime() - 6 * 60 * 60 * 1000),
    graceEnd: new Date(at.getTime() + 6 * 60 * 60 * 1000)
  };
}

export function longFormDecision(now: Date, slot: { at: Date; leadAt: Date; graceEnd: Date }, status: string | null): "wait" | "start" | "skip" {
  if (status === "published" || status === "publishing" || status === "skipped" || status === "producing") return "wait";
  if (now.getTime() < slot.leadAt.getTime()) return "wait";
  if (now.getTime() > slot.graceEnd.getTime()) return status ? "wait" : "skip";
  return "start";
}

function zoned(day: string, hour: number, minute: number, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  let utc = Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, hour, minute, 0);
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).formatToParts(new Date(utc));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const got = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), map.hour === "24" ? 0 : Number(map.hour), Number(map.minute), 0);
    const want = Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, hour, minute, 0);
    if (got === want) break;
    utc -= got - want;
  }
  return new Date(utc);
}

export function readJsonSetting<T>(db: GrowthDb, key: string, fallback: T): T {
  const raw = getSetting(db, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonSetting(db: GrowthDb, key: string, value: unknown): void {
  setSetting(db, key, JSON.stringify(value));
}

export function kitchenTopicId(title: string): string {
  const found = KITCHEN_TOPICS.find((topic) => topic.titles.en.split(" ").some((word) => word.length > 4 && title.toLowerCase().includes(word.toLowerCase())));
  return found?.id ?? "kitchen-layout";
}

export type GrowthComment = { id: string; threadId: string; text: string; videoId: string; replyCount: number };
export type GrowthVideo = { id: string; title: string };

export type SubscriberDeps = {
  now?: Date;
  log?: (message: string) => void;
  llm?: (comment: string, product: boolean) => Promise<string | null>;
  signals?: (kind: ShortsChannelKind) => Promise<string[]>;
  analytics?: (channelId: string) => Promise<Array<{ videoId: string; title?: string; views: number; viewRatio: number; subs: number }>>;
  listPlaylists?: (channelId: string) => Promise<Array<{ id: string; title: string }>>;
  createPlaylist?: (channelId: string, spec: PlaylistSpec) => Promise<string>;
  addToPlaylist?: (playlistId: string, videoId: string) => Promise<void>;
  listUploads?: (channelId: string) => Promise<GrowthVideo[]>;
  listComments?: (channelId: string) => Promise<GrowthComment[]>;
  reply?: (commentId: string, text: string) => Promise<void>;
  crossPost?: (input: { title: string; channelUrl: string; jobId: string }) => Promise<Array<{ network: string; status: string; detail: string }>>;
  submitBrief?: (brief: Record<string, unknown>) => Promise<string>;
  downloadFinal?: typeof downloadReelminoFinal;
  publishLong?: (itemId: string, destination: Destination, publishAt: Date | null) => Promise<{ id: string; status: string; remoteUrl?: string | null }>;
};

type RunContext = { db: GrowthDb; key: Buffer; mediaDir: string; publicBase: string };

export async function advanceSubscriberGrowth(ctx: RunContext, deps: SubscriberDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const log = deps.log ?? ((message: string) => console.log(`[subscriber-growth] ${message}`));
  const channels = destinationsForNetwork(ctx.db, "youtube").filter((row) => row.enabled && row.kind === "channel" && scheduledChannel(row));
  for (const destination of channels) {
    const kind = scheduledChannel(destination);
    if (!kind) continue;
    if (growthFlag("SHORTS_TOPIC_DEMAND")) await refreshDemand(ctx.db, kind, deps, now, log);
    if (growthFlag("SHORTS_WEIGHT_TUNING")) await refreshWeights(ctx.db, destination, kind, deps, now, log);
    if (growthFlag("SHORTS_PLAYLISTS")) await ensurePlaylists(ctx.db, destination, kind, deps, log);
    if (growthFlag("SHORTS_LONGFORM")) await advanceLongForm(ctx, destination, kind, now, deps, log);
    if (growthFlag("SHORTS_COMMENT_REPLIES")) await replyToComments(ctx.db, destination, kind === "product", now, deps, log);
    if (growthFlag("SHORTS_CROSSPOST")) await crossPostRecent(ctx.db, destination, deps, log);
  }
}

async function refreshDemand(db: GrowthDb, kind: ShortsChannelKind, deps: SubscriberDeps, now: Date, log: (message: string) => void): Promise<void> {
  const key = `demand_at:${kind}`;
  const last = Date.parse(getSetting(db, key) ?? "");
  if (Number.isFinite(last) && now.getTime() - last < 24 * 60 * 60 * 1000) return;
  const titles = deps.signals ? await deps.signals(kind).catch(() => []) : [];
  if (!titles.length) {
    setSetting(db, key, now.toISOString());
    return;
  }
  const ranked = rankDemand(titles);
  writeJsonSetting(db, `demand:${kind}`, ranked);
  setSetting(db, key, now.toISOString());
  log(`${kind} demand topics: ${ranked.map((item) => item.phrase).join(" | ")}`);
}

async function refreshWeights(
  db: GrowthDb,
  destination: Destination,
  kind: ShortsChannelKind,
  deps: SubscriberDeps,
  now: Date,
  log: (message: string) => void
): Promise<void> {
  const key = `weights_at:${destination.id}`;
  const last = Date.parse(getSetting(db, key) ?? "");
  if (Number.isFinite(last) && now.getTime() - last < 7 * 24 * 60 * 60 * 1000) return;
  if (!deps.analytics) {
    setSetting(db, key, now.toISOString());
    return;
  }
  const rows = await deps.analytics(destination.externalId).catch(() => []);
  if (!rows.length) {
    log(`${destination.externalId} analytics empty. Re-consent yt-analytics.readonly if this stays empty.`);
    setSetting(db, key, now.toISOString());
    return;
  }
  const median = medianOf(rows.map((row) => row.views));
  const next: Record<string, number> = {};
  for (const row of rows) {
    const id = kind === "kitchen" ? kitchenTopicId(row.title || row.videoId) : featureIdFromVideo(row.title || row.videoId);
    next[id] = tuneMultiplier({ views: row.views, viewRatio: row.viewRatio, subs: row.subs, medianViews: median });
  }
  writeJsonSetting(db, `weights:${kind}`, next);
  setSetting(db, key, now.toISOString());
  log(`${kind} weights ${JSON.stringify(next)}`);
}

async function ensurePlaylists(
  db: GrowthDb,
  destination: Destination,
  kind: ShortsChannelKind,
  deps: SubscriberDeps,
  log: (message: string) => void
): Promise<void> {
  if (!deps.listPlaylists || !deps.createPlaylist || !deps.addToPlaylist) return;
  const saved = readJsonSetting<Record<string, string>>(db, `playlists:${destination.id}`, {});
  const specs = kind === "kitchen"
    ? KITCHEN_PLAYLISTS.map(({ key, title, description }) => ({ key, title, description }))
    : PRODUCT_FEATURES.flatMap((feature) => playlistsForProduct(feature.id, "bakery").slice(0, 1)).concat(
        PRODUCT_BUSINESSES.map((business) => playlistsForProduct("one-sentence", business.id)[1]!).filter(Boolean)
      );
  for (const spec of specs) {
    if (saved[spec.key]) continue;
    const existing = (await deps.listPlaylists(destination.externalId)).find((row) => row.title === spec.title);
    saved[spec.key] = existing?.id ?? (await deps.createPlaylist(destination.externalId, spec));
    log(`playlist ${spec.title} -> ${saved[spec.key]}`);
  }
  writeJsonSetting(db, `playlists:${destination.id}`, saved);
  if (getSetting(db, `playlists_backfill:${destination.id}`) === "1" || !deps.listUploads) return;
  const videos = await deps.listUploads(destination.externalId);
  for (const video of videos) {
    const targets = kind === "kitchen" ? [playlistForKitchen(video.title)] : playlistsForProduct("one-sentence", "bakery");
    for (const target of targets) {
      const id = saved[target.key];
      if (id) await deps.addToPlaylist(id, video.id);
    }
  }
  setSetting(db, `playlists_backfill:${destination.id}`, "1");
}

export async function addUploadToPlaylists(db: GrowthDb, destination: Destination, videoId: string, title: string, deps: SubscriberDeps): Promise<void> {
  if (!growthFlag("SHORTS_PLAYLISTS") || !deps.addToPlaylist) return;
  const kind = scheduledChannel(destination);
  if (!kind) return;
  const saved = readJsonSetting<Record<string, string>>(db, `playlists:${destination.id}`, {});
  const targets = kind === "kitchen" ? [playlistForKitchen(title)] : playlistsForProduct(featureIdFromVideo(title), businessIdFromTitle(title));
  for (const target of targets) {
    const id = saved[target.key];
    if (id) await deps.addToPlaylist(id, videoId);
  }
}

async function advanceLongForm(
  ctx: RunContext,
  destination: Destination,
  kind: ShortsChannelKind,
  now: Date,
  deps: SubscriberDeps,
  log: (message: string) => void
): Promise<void> {
  const slot = sundaySlot(now, process.env.SHORTS_TIMEZONE?.trim() || "Asia/Jerusalem");
  const key = `${slot.key}:${destination.externalId}`;
  const row = ctx.db.prepare("SELECT status, run_id, item_id FROM shorts_slots WHERE slot_key = ?").get(key) as { status?: string; run_id?: string; item_id?: string } | undefined;
  if (row?.status === "producing" && row.run_id && row.item_id) {
    await pullLongForm(ctx, destination, key, row.run_id, row.item_id, slot.at, now, deps, log);
    return;
  }
  const decision = longFormDecision(now, slot, row?.status ?? null);
  if (decision === "wait") return;
  if (decision === "skip") {
    ctx.db.prepare(
      `INSERT INTO shorts_slots (slot_key, destination_id, publish_at, status, attempts, title, item_id, run_id, job_id, error, created_at, updated_at)
       VALUES (?, ?, ?, 'skipped', 0, '', NULL, NULL, NULL, 'missed weekly long-form', ?, ?)
       ON CONFLICT(slot_key) DO NOTHING`
    ).run(key, destination.id, slot.at.toISOString(), now.toISOString(), now.toISOString());
    log(`${key} skipped: missed weekly slot`);
    return;
  }
  const parts = kind === "kitchen" ? ["Keep the herbs", "Dry the produce", "Label the leftovers"] : ["Type one sentence", "Apply the brand", "Publish the video"];
  const topic = kind === "kitchen" ? "keep food fresh" : "a bakery";
  const playlistId = readJsonSetting<Record<string, string>>(ctx.db, `playlists:${destination.id}`, {});
  const firstPlaylist = Object.values(playlistId)[0];
  const pack = longFormPackage({
    kind,
    topic,
    parts,
    playlistUrl: firstPlaylist ? `https://www.youtube.com/playlist?list=${firstPlaylist}` : undefined
  });
  const gate = evaluateLongForm(pack);
  if (!gate.ok) {
    log(`${key} long-form gate: ${gate.reasons.join(" ")}`);
    return;
  }
  const copy = emptyCopy();
  copy.youtube = { title: pack.title, body: pack.description };
  copy.article = { title: pack.title, description: pack.description, body: pack.script };
  const item = insertItem(ctx.db, {
    id: nid(),
    slug: `long-${nid()}`,
    source: "longform",
    title: pack.title,
    summary: pack.title,
    language: "en",
    copy,
    mediaPath: null,
    mediaMime: null,
    mediaKind: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationMs: pack.durationSeconds * 1000,
    reelminoRunId: null
  });
  try {
    const runId = await (deps.submitBrief ?? submitReelminoBrief)({
      title: pack.title,
      sourceText: pack.script,
      instructions: `${pack.description} 16:9. No greeting. Say subscribe in the middle and at the end. Chapters match the description.`,
      language: "en",
      durationSeconds: pack.durationSeconds,
      aspectRatio: "16:9",
      approvalMode: "auto",
      targetAudience: kind === "kitchen" ? "home cooks" : "small business owners"
    });
    updateItem(ctx.db, item.id, { reelminoRunId: runId });
    ctx.db.prepare(
      `INSERT INTO shorts_slots (slot_key, destination_id, publish_at, status, attempts, title, item_id, run_id, job_id, error, created_at, updated_at)
       VALUES (?, ?, ?, 'producing', 1, ?, ?, ?, NULL, NULL, ?, ?)
       ON CONFLICT(slot_key) DO UPDATE SET status = 'producing', title = excluded.title, item_id = excluded.item_id, run_id = excluded.run_id, updated_at = excluded.updated_at`
    ).run(key, destination.id, slot.at.toISOString(), pack.title, item.id, runId, now.toISOString(), now.toISOString());
    log(`${key} long-form rendering: ${pack.title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${key} long-form submit failed: ${message}`);
  }
}

async function pullLongForm(
  ctx: RunContext,
  destination: Destination,
  key: string,
  runId: string,
  itemId: string,
  publishAt: Date,
  now: Date,
  deps: SubscriberDeps,
  log: (message: string) => void
): Promise<void> {
  const file = await (deps.downloadFinal ?? downloadReelminoFinal)(runId, ctx.mediaDir);
  if (!file) return;
  updateItem(ctx.db, itemId, { mediaPath: file.filename, mediaMime: "video/mp4", mediaKind: "video", mediaWidth: 1920, mediaHeight: 1080 });
  const when = publishAt.getTime() > now.getTime() + 60_000 ? publishAt : null;
  const result = deps.publishLong
    ? await deps.publishLong(itemId, destination, when)
    : await runPublish({
        db: ctx.db,
        key: ctx.key,
        mediaDir: ctx.mediaDir,
        publicBase: ctx.publicBase,
        item: getItem(ctx.db, itemId)!,
        destination,
        publishAt: when
      });
  if (result.remoteUrl) setSetting(ctx.db, `longform_url:${destination.id}`, result.remoteUrl);
  ctx.db.prepare("UPDATE shorts_slots SET status = ?, job_id = ?, updated_at = ? WHERE slot_key = ?").run(
    result.status === "published" || result.status === "draft" ? "published" : "publishing",
    result.id,
    now.toISOString(),
    key
  );
  log(`${key} long-form uploaded`);
}

async function replyToComments(
  db: GrowthDb,
  destination: Destination,
  product: boolean,
  now: Date,
  deps: SubscriberDeps,
  log: (message: string) => void
): Promise<void> {
  const stampKey = `comments_at:${destination.id}`;
  const last = Date.parse(getSetting(db, stampKey) ?? "");
  if (Number.isFinite(last) && now.getTime() - last < COMMENT_SCAN_MS) return;
  setSetting(db, stampKey, now.toISOString());
  if (!deps.listComments || !deps.reply) return;
  const day = now.toISOString().slice(0, 10);
  const used = db.prepare("SELECT COUNT(*) AS n FROM growth_replies WHERE channel_id = ? AND created_at >= ?").get(destination.externalId, `${day}T00:00:00.000Z`) as { n?: number };
  let remaining = COMMENT_DAILY_CAP - Number(used?.n ?? 0);
  const comments = await deps.listComments(destination.externalId);
  for (const comment of comments) {
    if (remaining <= 0) break;
    const seen = db.prepare("SELECT 1 AS n FROM growth_replies WHERE comment_id = ?").get(comment.id);
    if (seen || comment.replyCount > 0) continue;
    if (commentDecision(comment.text) === "skip") {
      log(`skip comment ${comment.id}`);
      continue;
    }
    const draft = deps.llm ? await deps.llm(comment.text, product) : null;
    if (!draft) {
      log(`no reply model for ${comment.id}`);
      continue;
    }
    let text = finishReply(draft);
    if (!replyAllowsLink(comment.text, product)) text = text.replace(/https?:\/\/\S+/g, "").trim();
    await deps.reply(comment.id, text.slice(0, 200));
    db.prepare("INSERT INTO growth_replies (comment_id, channel_id, created_at) VALUES (?, ?, ?)").run(comment.id, destination.externalId, now.toISOString());
    remaining -= 1;
  }
}

async function crossPostRecent(db: GrowthDb, destination: Destination, deps: SubscriberDeps, log: (message: string) => void): Promise<void> {
  const targets = crossPostTargets();
  if (!targets.buffer && !targets.tiktok && !targets.instagram && !targets.facebook) return;
  const jobs = db.prepare(
    `SELECT jobs.id AS id, items.title AS title FROM jobs JOIN items ON items.id = jobs.item_id
     WHERE jobs.destination_id = ? AND jobs.network = 'youtube' AND jobs.status = 'published' AND items.source = 'shorts-schedule'
     ORDER BY jobs.created_at DESC LIMIT 5`
  ).all(destination.id) as Array<{ id?: string; title?: string }>;
  const channelUrl = destination.externalId === REELMINO_CHANNEL_ID || /reelminoapp/i.test(`${destination.handle ?? ""}`)
    ? "https://www.youtube.com/channel/UC3iee8PYICmnfO5s8viJgkQ"
    : `https://www.youtube.com/channel/${KITCHEN_CHANNEL_ID}`;
  for (const job of jobs) {
    if (!job.id) continue;
    const done = db.prepare("SELECT 1 AS n FROM growth_crossposts WHERE job_id = ?").get(job.id);
    if (done) continue;
    const caption = crossPostCaption(job.title ?? "", channelUrl);
    const results = deps.crossPost ? await deps.crossPost({ title: caption, channelUrl, jobId: job.id }) : await defaultCrossPost(caption);
    for (const result of results) {
      db.prepare("INSERT OR REPLACE INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, ?, ?, ?, ?)").run(
        job.id,
        result.network,
        result.status,
        result.detail,
        new Date().toISOString()
      );
      log(`cross-post ${result.network} ${result.status}: ${result.detail}`);
    }
  }
}

async function defaultCrossPost(text: string): Promise<Array<{ network: string; status: string; detail: string }>> {
  const targets = crossPostTargets();
  const results: Array<{ network: string; status: string; detail: string }> = [];
  if (targets.buffer) {
    const response = await fetch("https://api.bufferapp.com/1/updates/create.json", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: process.env.BUFFER_ACCESS_TOKEN ?? "",
        "profile_ids[]": process.env.BUFFER_CHANNEL_ID ?? "",
        text,
        now: "true"
      })
    });
    results.push({ network: "buffer", status: response.ok ? "posted" : "failed", detail: String(response.status) });
  }
  if (targets.facebook) {
    const response = await fetch(`https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/feed`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.FACEBOOK_PAGE_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    results.push({ network: "facebook", status: response.ok ? "posted" : "failed", detail: "Page feed post with the YouTube link. Native Reel file upload is not sent." });
  }
  if (targets.instagram) results.push({ network: "instagram", status: "skipped", detail: "INSTAGRAM_ACCOUNT_ID is set, but a public video URL is required for Reels. Not posted." });
  if (targets.tiktok) results.push({ network: "tiktok", status: "skipped", detail: "TIKTOK_ACCESS_TOKEN is set, but chunked video upload is not sent from this host." });
  return results;
}

function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function featureIdFromVideo(value: string): string {
  const found = PRODUCT_FEATURES.find((feature) => feature.aliases.some((alias) => value.toLowerCase().includes(alias.toLowerCase())));
  return found?.id ?? "one-sentence";
}

function businessIdFromTitle(title: string): string {
  const found = PRODUCT_BUSINESSES.find((business) => title.toLowerCase().includes(business.label.toLowerCase()));
  return found?.id ?? "bakery";
}
