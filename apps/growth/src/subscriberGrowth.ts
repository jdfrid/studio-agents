import { KITCHEN_TOPICS, KITCHEN_WINNER_SEED, kitchenRelevantPhrase, PRODUCT_BUSINESSES, PRODUCT_FEATURES, rankTopicPerformance, seriesForTopic, subscribeUrl, type ShortsChannelKind, type TopicScore } from "@studio/shared";
import { destinationsForNetwork, getItem, getSetting, insertItem, setSetting, updateItem, type Destination, type GrowthDb } from "./db.js";
import { nid } from "./crypto.js";
import { emptyCopy } from "./copy.js";
import { freshConnectionTokens, runPublish } from "./publish.js";
import { profileFor, writeChannelBranding } from "./channelProfile.js";
import { downloadReelminoFinal, submitReelminoBrief } from "./produce.js";
import { KITCHEN_CHANNEL_ID, REELMINO_CHANNEL_ID, scheduledChannel } from "./shortsSchedule.js";
import { advancePromoBackfill } from "./promoLinks.js";
import { advanceTelegramCrossPosts } from "./telegramCrossPost.js";
import { advanceZernioCrossPosts, crossPostCaption, logZernioAnalytics, zernioApiKey } from "./zernio.js";

export { crossPostCaption };

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
  { key: "fresh-longer", title: "Fresh Longer", description: "Storage and freshness fixes, one new angle each Short.", match: /^fresh longer\b/i },
  { key: "work-triangle", title: "Work Triangle", description: "Kitchen layout, the work triangle, and where the daily tools go.", match: /^work triangle\b/i },
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

export function playlistTargets(kind: ShortsChannelKind, text: string): PlaylistSpec[] {
  if (kind === "kitchen") return [playlistForKitchen(text)];
  const feature = classifiedFeatureId(text);
  const business = classifiedBusinessId(text);
  const specs: PlaylistSpec[] = [];
  if (feature) {
    const featureList = playlistsForProduct(feature, business ?? "bakery")[0];
    if (featureList) specs.push(featureList);
  }
  if (business) {
    const businessList = playlistsForProduct(feature ?? "one-sentence", business)[1];
    if (businessList) specs.push(businessList);
  }
  return specs;
}

export function playlistEdits(input: {
  kind: ShortsChannelKind;
  items: Array<{ playlistKey: string; playlistItemId: string; videoId: string; title: string }>;
}): { remove: string[]; add: Array<{ playlistKey: string; videoId: string }> } {
  const remove: string[] = [];
  const present = new Set<string>();
  for (const item of input.items) {
    present.add(`${item.playlistKey}:${item.videoId}`);
    const wanted = new Set(playlistTargets(input.kind, item.title).map((spec) => spec.key));
    if (!wanted.has(item.playlistKey)) remove.push(item.playlistItemId);
  }
  const add: Array<{ playlistKey: string; videoId: string }> = [];
  const seen = new Set<string>();
  for (const item of input.items) {
    for (const spec of playlistTargets(input.kind, item.title)) {
      const key = `${spec.key}:${item.videoId}`;
      if (present.has(key) || seen.has(key)) continue;
      seen.add(key);
      add.push({ playlistKey: spec.key, videoId: item.videoId });
    }
  }
  return { remove, add };
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
  const chapters = input.description.match(/^\d{1,2}:\d{2}\s+\S/gm) ?? [];
  if (chapters.length < 3) reasons.push("Description needs at least three chapters.");
  const subscribes = input.script.match(/\bsubscribe\b/gi) ?? [];
  if (subscribes.length < 2) reasons.push("Say subscribe once in the middle and once at the end.");
  if (input.durationSeconds < 180 || input.durationSeconds > 300) reasons.push("Length must be 3 to 5 minutes.");
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
    : `How to make a ${topic} ad in 60 seconds with Reelmino`.slice(0, 70);
  const steps = input.parts.length ? input.parts : ["Show the problem", "Do the fix", "Show the result"];
  const playlist = input.playlistUrl ? `\n\nShorts in this series: ${input.playlistUrl}` : "";
  const description = `${ensureChapterDescription(`${title}.`, steps.join("\n"))}${playlist}\n\nEnd screen: subscribe and watch the next Short.`;
  const reason = input.kind === "kitchen"
    ? "New kitchen tip every day - subscribe so you don't miss tomorrow's."
    : "A new Reelmino trick every day - subscribe.";
  const script = [
    `${topic} is the whole video.`,
    ...steps.map((step) => `${step}.`),
    `Halfway through: ${reason}`,
    `At the end: ${reason}`
  ].join("\n");
  return { title, description, script, durationSeconds: 240 };
}

export function sundaySlot(now: Date, timeZone: string, hour = 18, minute = 0, weekdayWanted = 0): { key: string; at: Date; leadAt: Date; graceEnd: Date } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const delta = weekdayWanted - index;
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

export function tutorialSlot(now: Date, timeZone: string, kind: ShortsChannelKind): { key: string; at: Date; leadAt: Date; graceEnd: Date } {
  return sundaySlot(now, timeZone, 18, 0, kind === "kitchen" ? 2 : 4);
}

export function readWinnerIds(db: GrowthDb, kind: ShortsChannelKind): string[] {
  const raw = getSetting(db, `winners:${kind}`);
  const fallback = kind === "kitchen" ? KITCHEN_WINNER_SEED : [];
  const parsed = raw ? (JSON.parse(raw) as TopicScore[]) : fallback;
  return (Array.isArray(parsed) ? parsed : fallback).map((row) => row.topicId).filter(Boolean);
}

export const LONGFORM_MAX_ATTEMPTS = 3;

export function longFormBackoffMs(attempts: number): number {
  return Math.min(6 * 60 * 60 * 1000, 15 * 60 * 1000 * 4 ** Math.max(0, attempts - 1));
}

export function ensureChapterDescription(description: string, script: string): string {
  const found = description.match(/^\d{1,2}:\d{2}\s+\S/gm) ?? [];
  if (found.length >= 3) return description;
  const steps = script
    .split(/\n+/)
    .map((line) => line.replace(/[.!?]+$/g, "").trim())
    .filter((line) => line.length > 3 && !/\bsubscribe\b/i.test(line))
    .slice(0, 3);
  while (steps.length < 3) steps.push(`Part ${steps.length + 1}`);
  const chapters = steps.map((step, index) => `${index}:00 ${step}`).join("\n");
  const head = description.split("\n").map((line) => line.trim()).find((line) => line && !/^\d{1,2}:\d{2}\s/.test(line)) || "Full video.";
  return `${head}\n\n${chapters}`;
}

export function longFormDecision(
  now: Date,
  slot: { at: Date; leadAt: Date; graceEnd: Date },
  status: string | null,
  attempts = 0,
  updatedAt: Date | null = null
): "wait" | "start" | "skip" | "retry" {
  if (status === "upload_failed" || status === "failed") {
    if (attempts >= LONGFORM_MAX_ATTEMPTS) return "skip";
    if (updatedAt && now.getTime() - updatedAt.getTime() < longFormBackoffMs(Math.max(1, attempts))) return "wait";
    if (now.getTime() > slot.graceEnd.getTime()) return "wait";
    return "retry";
  }
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
  listPlaylistItems?: (playlistId: string) => Promise<Array<{ playlistItemId: string; videoId: string; title: string }>>;
  removePlaylistItem?: (playlistItemId: string) => Promise<void>;
  publishPlaylist?: (playlistId: string) => Promise<void>;
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
    const bound = await bindLiveYoutube(ctx, destination, deps, log);
    if (growthFlag("SHORTS_TOPIC_DEMAND")) await refreshDemand(ctx.db, kind, bound, now, log);
    if (growthFlag("SHORTS_WINNERS")) await refreshWinners(ctx, destination, kind, now, log);
    if (growthFlag("SHORTS_WEIGHT_TUNING")) await refreshWeights(ctx.db, destination, kind, bound, now, log);
    if (growthFlag("SHORTS_PLAYLISTS")) await ensurePlaylists(ctx.db, destination, kind, bound, log);
    if (growthFlag("SHORTS_LONGFORM")) await advanceLongForm(ctx, destination, kind, now, bound, log);
    if (growthFlag("SHORTS_COMMENT_REPLIES")) await replyToComments(ctx.db, destination, kind === "product", now, bound, log);
    if (growthFlag("SHORTS_CROSSPOST") && !zernioApiKey()) await crossPostRecent(ctx.db, destination, bound, log);
  }
  if (growthFlag("SHORTS_CROSSPOST") && zernioApiKey()) {
    await advanceZernioCrossPosts(ctx.db, { now, mediaDir: ctx.mediaDir, log });
  }
  if (growthFlag("SHORTS_CROSSPOST")) {
    await advanceTelegramCrossPosts(ctx.db, { now, mediaDir: ctx.mediaDir, log });
  }
  if (growthFlag("SHORTS_WEIGHT_TUNING")) await logZernioAnalytics(ctx.db, now, log);
  if (growthFlag("SHORTS_CHANNEL_SEO")) await maintainChannels(ctx, now, log);
  if (growthFlag("SHORTS_PROMO_LINKS")) {
    await advancePromoBackfill(ctx.db, {
      now,
      log,
      tokenFor: async (connectionId) => (await freshConnectionTokens(ctx.db, connectionId, ctx.key, "youtube")).accessToken
    });
  }
}

async function bindLiveYoutube(ctx: RunContext, destination: Destination, deps: SubscriberDeps, log: (message: string) => void): Promise<SubscriberDeps> {
  const needsLive = !deps.listPlaylists || !deps.listComments || !deps.analytics || !deps.signals || !deps.reply || !deps.llm;
  if (!needsLive) return deps;
  let token = "";
  if (!deps.listPlaylists || !deps.listComments || !deps.analytics || !deps.signals || !deps.reply) {
    try {
      token = (await freshConnectionTokens(ctx.db, destination.connectionId, ctx.key, "youtube")).accessToken;
    } catch (error) {
      log(`${destination.id} youtube token unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const live = token ? liveYoutube(token) : null;
  return {
    ...deps,
    signals: deps.signals ?? (live ? () => live.signals() : async () => []),
    analytics: deps.analytics ?? (live ? (channelId) => live.analytics(channelId) : undefined),
    listPlaylists: deps.listPlaylists ?? (live ? () => live.listPlaylists() : undefined),
    createPlaylist: deps.createPlaylist ?? (live ? (_channelId, spec) => live.createPlaylist(spec) : undefined),
    addToPlaylist: deps.addToPlaylist ?? (live ? (playlistId, videoId) => live.addVideo(playlistId, videoId) : undefined),
    listPlaylistItems: deps.listPlaylistItems ?? (live ? (playlistId) => live.listPlaylistItems(playlistId) : undefined),
    removePlaylistItem: deps.removePlaylistItem ?? (live ? (playlistItemId) => live.removePlaylistItem(playlistItemId) : undefined),
    publishPlaylist: deps.publishPlaylist ?? (live ? (playlistId) => live.publishPlaylist(playlistId) : undefined),
    listUploads: deps.listUploads ?? (live ? () => live.listUploads() : undefined),
    listComments: deps.listComments ?? (live ? () => live.listComments(destination.externalId) : undefined),
    reply: deps.reply ?? (live ? (commentId, text) => live.reply(commentId, text) : undefined),
    llm: deps.llm ?? ((comment, product) => draftReply(comment, product))
  };
}

function liveYoutube(token: string) {
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    async signals(): Promise<string[]> {
      const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&maxResults=15&regionCode=US", { headers });
      if (!response.ok) return [];
      const data = (await response.json()) as { items?: Array<{ snippet?: { title?: string } }> };
      return (data.items ?? []).map((item) => item.snippet?.title ?? "").filter(Boolean);
    },
    async analytics(channelId: string) {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const url = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${encodeURIComponent(channelId)}&startDate=${start}&endDate=${end}&metrics=views,averageViewPercentage,subscribersGained&dimensions=video&sort=-views&maxResults=20`;
      const response = await fetch(url, { headers });
      if (!response.ok) return [];
      const data = (await response.json()) as { rows?: Array<[string, number, number, number]> };
      return (data.rows ?? []).map((row) => ({ videoId: row[0], views: row[1], viewRatio: row[2], subs: row[3] }));
    },
    async listPlaylists() {
      const response = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50", { headers });
      if (!response.ok) return [];
      const data = (await response.json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
      return (data.items ?? []).map((item) => ({ id: item.id ?? "", title: item.snippet?.title ?? "" })).filter((item) => item.id);
    },
    async createPlaylist(spec: PlaylistSpec) {
      const response = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
        method: "POST",
        headers,
        body: JSON.stringify({ snippet: { title: spec.title, description: spec.description }, status: { privacyStatus: "public" } })
      });
      if (!response.ok) throw new Error(`playlist create ${response.status}`);
      const data = (await response.json()) as { id?: string };
      if (!data.id) throw new Error("playlist create returned no id");
      return data.id;
    },
    async addVideo(playlistId: string, videoId: string) {
      await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
        method: "POST",
        headers,
        body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } })
      });
    },
    async listPlaylistItems(playlistId: string) {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}`, { headers });
      if (!response.ok) return [];
      const data = (await response.json()) as { items?: Array<{ id?: string; snippet?: { title?: string; resourceId?: { videoId?: string } } }> };
      return (data.items ?? []).map((item) => ({
        playlistItemId: item.id ?? "",
        videoId: item.snippet?.resourceId?.videoId ?? "",
        title: item.snippet?.title ?? ""
      })).filter((item) => item.playlistItemId && item.videoId);
    },
    async removePlaylistItem(playlistItemId: string) {
      await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?id=${encodeURIComponent(playlistItemId)}`, { method: "DELETE", headers });
    },
    async publishPlaylist(playlistId: string) {
      await fetch("https://www.googleapis.com/youtube/v3/playlists?part=status", {
        method: "PUT",
        headers,
        body: JSON.stringify({ id: playlistId, status: { privacyStatus: "public" } })
      });
    },
    async listUploads() {
      const channel = await fetch("https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true", { headers });
      if (!channel.ok) return [];
      const channelData = (await channel.json()) as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
      const uploads = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return [];
      const list = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(uploads)}&maxResults=50`, { headers });
      if (!list.ok) return [];
      const data = (await list.json()) as { items?: Array<{ snippet?: { title?: string; resourceId?: { videoId?: string } } }> };
      return (data.items ?? []).map((item) => ({ id: item.snippet?.resourceId?.videoId ?? "", title: item.snippet?.title ?? "" })).filter((item) => item.id);
    },
    async listComments(channelId: string): Promise<GrowthComment[]> {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&allThreadsRelatedToChannelId=${encodeURIComponent(channelId)}&maxResults=20`, { headers });
      if (!response.ok) return [];
      const data = (await response.json()) as { items?: Array<{ id?: string; snippet?: { totalReplyCount?: number; topLevelComment?: { id?: string; snippet?: { textDisplay?: string; videoId?: string } } } }> };
      return (data.items ?? []).map((item) => ({
        id: item.snippet?.topLevelComment?.id ?? item.id ?? "",
        threadId: item.id ?? "",
        text: item.snippet?.topLevelComment?.snippet?.textDisplay ?? "",
        videoId: item.snippet?.topLevelComment?.snippet?.videoId ?? "",
        replyCount: item.snippet?.totalReplyCount ?? 0
      })).filter((item) => item.id);
    },
    async reply(commentId: string, text: string) {
      const response = await fetch("https://www.googleapis.com/youtube/v3/comments?part=snippet", {
        method: "POST",
        headers,
        body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text.slice(0, 200) } })
      });
      if (!response.ok) throw new Error(`comment reply ${response.status}`);
    }
  };
}

async function draftReply(comment: string, product: boolean): Promise<string | null> {
  const gemini = process.env.GEMINI_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (!gemini && !openai) return null;
  const system = `Reply as the channel in the commenter's language. At most 180 characters. Helpful, no links${product ? " except https://reelmino.com when they ask how to try it" : ""}. End with one short question.`;
  try {
    if (gemini) {
      const model = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.0-flash";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(gemini)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: comment.slice(0, 1000) }] }]
        })
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${openai}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini",
        messages: [{ role: "system", content: system }, { role: "user", content: comment.slice(0, 1000) }]
      })
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

async function refreshWinners(ctx: RunContext, destination: Destination, kind: ShortsChannelKind, now: Date, log: (message: string) => void): Promise<void> {
  const stamp = `winners_at:${kind}`;
  const last = Date.parse(getSetting(ctx.db, stamp) ?? "");
  if (Number.isFinite(last) && now.getTime() - last < 24 * 60 * 60 * 1000) return;
  if (!getSetting(ctx.db, `winners:${kind}`) && kind === "kitchen") writeJsonSetting(ctx.db, `winners:${kind}`, KITCHEN_WINNER_SEED);
  try {
    const token = (await freshConnectionTokens(ctx.db, destination.connectionId, ctx.key, "youtube")).accessToken;
    const uploads = await listOwnedUploads(token);
    const ids = uploads.slice(0, 50).map((video) => video.id);
    if (ids.length) {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(ids.join(","))}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = (await response.json()) as { items?: Array<{ snippet?: { title?: string }; statistics?: { viewCount?: string } }> };
        const ranked = rankTopicPerformance((data.items ?? []).map((item) => ({
          title: item.snippet?.title ?? "",
          views: Number(item.statistics?.viewCount ?? 0)
        })), kind);
        if (ranked.length) writeJsonSetting(ctx.db, `winners:${kind}`, ranked);
        log(`${kind} winners ${ranked.map((row) => row.topicId).join(", ")}`);
      }
    }
  } catch (error) {
    log(`${kind} winners unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  setSetting(ctx.db, stamp, now.toISOString());
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
  const ranked = rankDemand(kind === "kitchen" ? titles.filter((title) => kitchenRelevantPhrase(title)) : titles);
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
    const targets = playlistTargets(kind, video.title);
    for (const target of targets) {
      const id = saved[target.key];
      if (id) await deps.addToPlaylist(id, video.id);
    }
  }
  setSetting(db, `playlists_backfill:${destination.id}`, "1");
  if (getSetting(db, `playlists_resort:${destination.id}`) === "1" || !deps.listPlaylistItems || !deps.removePlaylistItem) return;
  const listed = [];
  for (const [playlistKey, playlistId] of Object.entries(saved)) {
    const items = await deps.listPlaylistItems(playlistId);
    listed.push(...items.map((item) => ({ ...item, playlistKey })));
  }
  const edits = playlistEdits({ kind, items: listed });
  const budget = 10;
  let used = 0;
  for (const playlistItemId of edits.remove) {
    if (used >= budget) break;
    await deps.removePlaylistItem(playlistItemId);
    used += 1;
  }
  for (const add of edits.add) {
    if (used >= budget) break;
    const playlistId = saved[add.playlistKey];
    if (!playlistId || !deps.addToPlaylist) continue;
    await deps.addToPlaylist(playlistId, add.videoId);
    used += 1;
  }
  if (used < budget) {
    if (deps.publishPlaylist) {
      for (const playlistId of Object.values(saved)) await deps.publishPlaylist(playlistId);
    }
    setSetting(db, `playlists_resort:${destination.id}`, "1");
  }
  log(`playlist resort ${destination.id}: removed ${Math.min(edits.remove.length, budget)} and queued ${edits.add.length}`);
}

export async function addUploadToPlaylists(db: GrowthDb, destination: Destination, videoId: string, title: string, deps: SubscriberDeps): Promise<void> {
  if (!growthFlag("SHORTS_PLAYLISTS") || !deps.addToPlaylist) return;
  const kind = scheduledChannel(destination);
  if (!kind) return;
  const saved = readJsonSetting<Record<string, string>>(db, `playlists:${destination.id}`, {});
  const targets = playlistTargets(kind, title);
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
  const slot = tutorialSlot(now, process.env.SHORTS_TIMEZONE?.trim() || "Asia/Jerusalem", kind);
  const key = `${slot.key}:${destination.externalId}`;
  const row = ctx.db.prepare("SELECT status, run_id, item_id, attempts, updated_at FROM shorts_slots WHERE slot_key = ?").get(key) as { status?: string; run_id?: string; item_id?: string; attempts?: number; updated_at?: string } | undefined;
  const attempts = Number(row?.attempts ?? 0);
  const updatedAt = row?.updated_at ? new Date(row.updated_at) : null;
  if (row?.status === "producing" && row.run_id && row.item_id) {
    await pullLongForm(ctx, destination, key, row.run_id, row.item_id, slot.at, now, deps, log);
    return;
  }
  const early = longFormDecision(now, slot, row?.status ?? null, attempts, updatedAt);
  if ((row?.status === "upload_failed" || row?.status === "failed") && early === "skip") {
    ctx.db.prepare("UPDATE shorts_slots SET status = 'skipped', error = ?, updated_at = ? WHERE slot_key = ?").run("long-form stopped after repeated failures", now.toISOString(), key);
    log(`${key} skipped after ${attempts} long-form attempts`);
    return;
  }
  if (row?.status === "upload_failed" && row.item_id && early === "retry") {
    await publishLongItem(ctx, destination, key, row.item_id, slot.at, now, deps, log);
    return;
  }
  const decision = early;
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
  const winnerId = readWinnerIds(ctx.db, kind)[0] ?? (kind === "kitchen" ? "herbs" : "one-sentence");
  const seriesName = seriesForTopic(winnerId)?.name;
  const business = PRODUCT_BUSINESSES[Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000)) % PRODUCT_BUSINESSES.length];
  const parts = kind === "kitchen"
    ? (seriesName === "Work Triangle" ? ["Clear the counter", "Place the daily pan", "Check the triangle"] : ["Keep the herbs", "Dry the produce", "Label the leftovers"])
    : ["Type one sentence", "Apply the brand", "Publish the video"];
  const topic = kind === "kitchen" ? (seriesName === "Work Triangle" ? "the work triangle" : "keep food fresh") : (business?.label ?? "bakery");
  const seriesLabel = kind === "kitchen" ? seriesName : business?.label;
  if (seriesLabel) setSetting(ctx.db, `longform_series:${destination.id}`, seriesLabel);
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
    const nextAttempts = attempts + 1;
    ctx.db.prepare(
      `INSERT INTO shorts_slots (slot_key, destination_id, publish_at, status, attempts, title, item_id, run_id, job_id, error, created_at, updated_at)
       VALUES (?, ?, ?, 'failed', ?, ?, NULL, NULL, NULL, ?, ?, ?)
       ON CONFLICT(slot_key) DO UPDATE SET status = 'failed', attempts = excluded.attempts, error = excluded.error, updated_at = excluded.updated_at`
    ).run(key, destination.id, slot.at.toISOString(), nextAttempts, pack.title, gate.reasons.join(" "), now.toISOString(), now.toISOString());
    log(`${key} long-form gate: ${gate.reasons.join(" ")}. Next try after backoff.`);
    return;
  }
  const copy = emptyCopy();
  const description = growthFlag("SHORTS_SUBSCRIBE_CTA")
    ? `${pack.description}\n\nSubscribe: ${subscribeUrl(destination.externalId)}`
    : pack.description;
  copy.youtube = { title: pack.title, body: description };
  copy.article = { title: pack.title, description, body: pack.script };
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
  if (result.status === "failed") {
    ctx.db.prepare("UPDATE shorts_slots SET status = 'upload_failed', attempts = attempts + 1, job_id = ?, error = ?, updated_at = ? WHERE slot_key = ?").run(
      result.id,
      ("lastError" in result && result.lastError) || "upload failed",
      now.toISOString(),
      key
    );
    log(`${key} long-form upload failed and will be retried`);
    return;
  }
  if (result.remoteUrl) setSetting(ctx.db, `longform_url:${destination.id}`, result.remoteUrl);
  ctx.db.prepare("UPDATE shorts_slots SET status = ?, job_id = ?, error = NULL, updated_at = ? WHERE slot_key = ?").run(
    result.status === "published" || result.status === "draft" ? "published" : "publishing",
    result.id,
    now.toISOString(),
    key
  );
  log(`${key} long-form uploaded`);
}

async function publishLongItem(
  ctx: RunContext,
  destination: Destination,
  key: string,
  itemId: string,
  publishAt: Date,
  now: Date,
  deps: SubscriberDeps,
  log: (message: string) => void
): Promise<void> {
  const item = getItem(ctx.db, itemId);
  if (!item?.mediaPath) return;
  const when = publishAt.getTime() > now.getTime() + 60_000 ? publishAt : null;
  const result = deps.publishLong
    ? await deps.publishLong(itemId, destination, when)
    : await runPublish({
        db: ctx.db,
        key: ctx.key,
        mediaDir: ctx.mediaDir,
        publicBase: ctx.publicBase,
        item,
        destination,
        publishAt: when
      });
  if (result.status === "failed") {
    ctx.db.prepare("UPDATE shorts_slots SET status = 'upload_failed', attempts = attempts + 1, error = ?, updated_at = ? WHERE slot_key = ?").run(
      "upload failed",
      now.toISOString(),
      key
    );
    log(`${key} long-form upload failed and will be retried`);
    return;
  }
  if (result.remoteUrl) setSetting(ctx.db, `longform_url:${destination.id}`, result.remoteUrl);
  ctx.db.prepare("UPDATE shorts_slots SET status = ?, job_id = ?, error = NULL, updated_at = ? WHERE slot_key = ?").run(
    result.status === "published" || result.status === "draft" ? "published" : "publishing",
    result.id,
    now.toISOString(),
    key
  );
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

const HIDE_TITLES = ["What matters now", "אשה מדברת בסגנון קליל ומצחיק", "איך חותכים בצל עם פחות דמעות?"];

async function maintainChannels(ctx: RunContext, now: Date, log: (message: string) => void): Promise<void> {
  if (getSetting(ctx.db, "channel_maintenance_done") === "1") return;
  const last = Date.parse(getSetting(ctx.db, "channel_maintenance_at") ?? "");
  if (Number.isFinite(last) && now.getTime() - last < 24 * 60 * 60 * 1000) return;
  setSetting(ctx.db, "channel_maintenance_at", now.toISOString());
  try {
    const channels = destinationsForNetwork(ctx.db, "youtube").filter((row) => row.enabled && scheduledChannel(row));
    for (const destination of channels) {
      const token = (await freshConnectionTokens(ctx.db, destination.connectionId, ctx.key, "youtube")).accessToken;
      const uploads = await listOwnedUploads(token);
      const kind = scheduledChannel(destination);
      if (kind === "kitchen") {
        for (const video of uploads) {
          if (!HIDE_TITLES.some((title) => video.title.includes(title))) continue;
          const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
            method: "PUT",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ id: video.id, status: { privacyStatus: "private" } })
          });
          if (!response.ok) throw new Error(`privacy update ${response.status}`);
          log(`set private: ${video.title}`);
        }
      }
      if (kind === "product") {
        const trailer = uploads.find((video) => /one sentence/i.test(video.title));
        if (trailer) {
          await writeChannelBranding(token, destination.externalId, profileFor(destination), trailer.id);
          log(`unsubscribed trailer set to ${trailer.id}`);
        } else {
          log("YouTube can set unsubscribedTrailer, but no one-sentence demo was in the latest uploads.");
        }
      }
    }
    setSetting(ctx.db, "channel_maintenance_done", "1");
  } catch (error) {
    log(`channel maintenance: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function listOwnedUploads(token: string): Promise<Array<{ id: string; title: string }>> {
  const channel = await fetch("https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true", {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!channel.ok) return [];
  const channelData = (await channel.json()) as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
  const uploads = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];
  const list = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(uploads)}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!list.ok) return [];
  const data = (await list.json()) as { items?: Array<{ snippet?: { title?: string; resourceId?: { videoId?: string } } }> };
  return (data.items ?? []).map((item) => ({ id: item.snippet?.resourceId?.videoId ?? "", title: item.snippet?.title ?? "" })).filter((item) => item.id);
}

function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function classifiedFeatureId(value: string): string | null {
  const found = PRODUCT_FEATURES.find((feature) => feature.aliases.some((alias) => value.toLowerCase().includes(alias.toLowerCase())));
  return found?.id ?? null;
}

function classifiedBusinessId(value: string): string | null {
  const found = PRODUCT_BUSINESSES.find((business) => value.toLowerCase().includes(business.label.toLowerCase()));
  return found?.id ?? null;
}

function featureIdFromVideo(value: string): string {
  return classifiedFeatureId(value) ?? "one-sentence";
}

function businessIdFromTitle(title: string): string {
  return classifiedBusinessId(title) ?? "bakery";
}
