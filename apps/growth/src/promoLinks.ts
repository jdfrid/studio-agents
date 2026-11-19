import { matchProductDemo } from "@studio/shared";
import { destinationsForNetwork, getSetting, setSetting, type GrowthDb } from "./db.js";
import { jerusalemDayStart } from "./youtubeQuota.js";

export const PROMO_MARKER = "See Reelmino do this:";
export const PROMO_MARKER_HE = "ראו איך Reelmino";
const SITE = "https://reelmino.com";
const KITCHEN_CHANNEL_ID = "UCsKPN8oZJOPM4KJC4bN_ANw";
const REELMINO_CHANNEL_ID = "UC3iee8PYICmnfO5s8viJgkQ";
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export type PromoChannel = "kitchen" | "product";

export type PromoVideo = {
  videoId: string;
  title: string;
  featureId: string | null;
  publishedAt: string;
};

export type PromoUpload = PromoVideo & {
  description: string;
  channel: PromoChannel;
};

type DestinationLike = { externalId?: string | null; handle?: string | null; name?: string | null; url?: string | null; id?: string; connectionId?: string };

export function promoChannel(destination: DestinationLike): PromoChannel | null {
  const id = destination.externalId ?? "";
  const blob = `${destination.handle ?? ""} ${destination.name ?? ""} ${destination.url ?? ""}`;
  if (id === KITCHEN_CHANNEL_ID || /kitchentips/i.test(blob)) return "kitchen";
  if (id === REELMINO_CHANNEL_ID || /reelminoapp/i.test(blob)) return "product";
  return null;
}

export function promoBackfillPerDay(raw = process.env.SHORTS_PROMO_BACKFILL_PER_DAY): number {
  const parsed = Number(raw?.trim());
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 20) return parsed;
  return 1;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function featureIdFromText(title: string, script = ""): string | null {
  return matchProductDemo(`${title}\n${script}`)?.featureId ?? null;
}

export function choosePromo(input: {
  catalog: PromoVideo[];
  channel: PromoChannel;
  featureId?: string | null;
  title?: string;
  selfVideoId?: string | null;
  recentIds?: string[];
}): PromoVideo | null {
  const recent = input.recentIds ?? [];
  let pool = input.catalog.filter((video) => video.videoId && video.videoId !== input.selfVideoId);
  if (input.channel === "product" && input.featureId) pool = pool.filter((video) => video.featureId !== input.featureId);
  if (!pool.length) return null;
  const scored = input.channel === "kitchen" ? pool.map((video) => ({ video, score: topicScore(input.title ?? "", video) })) : [];
  const best = scored.reduce((max, row) => Math.max(max, row.score), 0);
  const preferred = best > 0 ? scored.filter((row) => row.score === best).map((row) => row.video) : pool;
  const unused = preferred.filter((video) => !recent.includes(video.videoId));
  const ring = unused.length ? unused : preferred;
  return ring[recent.length % ring.length] ?? null;
}

export function withPromoDescription(body: string, promo: PromoVideo, language = "en"): string {
  const url = watchUrl(promo.videoId);
  if (body.includes(url) || body.includes(PROMO_MARKER) || body.includes(PROMO_MARKER_HE)) return body;
  const hebrew = language.toLowerCase().startsWith("he");
  const line = hebrew
    ? `${PROMO_MARKER_HE} עושה את זה: ${promo.title}\n${url}`
    : `${PROMO_MARKER} ${promo.title}\n${url}`;
  let next = body.trim();
  next = next ? `${next}\n\n${line}` : line;
  if (!next.includes("reelmino.com")) next = `${next}\n${SITE}`;
  return next.length > 5000 ? next.slice(0, 5000) : next;
}

export function promoCommentText(input: {
  kind: PromoChannel;
  script?: string;
  language?: string;
  promo?: PromoVideo | null;
}): string {
  const promo = input.promo;
  const cta = promo
    ? withPromoDescription("", promo, input.language).trim()
    : "";
  if (input.kind === "product") {
    const prompt = (input.script ?? "").split(/\n+/).map((line) => line.trim()).find(Boolean) ?? "";
    const base = prompt ? `${prompt}\n${SITE}` : SITE;
    if (!cta || base.includes(watchUrl(promo!.videoId))) return base.slice(0, 10000);
    return `${base}\n\n${cta}`.slice(0, 10000);
  }
  return cta.slice(0, 10000);
}

export function nextBackfillTarget(rows: PromoUpload[], now: Date, done: string[]): PromoUpload | null {
  const doneSet = new Set(done);
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const waiting = rows.filter((row) => {
    const at = Date.parse(row.publishedAt);
    return Number.isFinite(at) && at >= cutoff && at <= now.getTime() && !doneSet.has(row.videoId) && !hasPromo(row.description);
  });
  waiting.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  return waiting[0] ?? null;
}

export function youtubeSnippetUpdate(
  videoId: string,
  current: { title?: string; categoryId?: string; tags?: string[]; defaultLanguage?: string },
  description: string
): { id: string; snippet: Record<string, unknown> } {
  const snippet: Record<string, unknown> = {
    title: current.title || "Short",
    description,
    categoryId: current.categoryId || "22"
  };
  if (current.tags?.length) snippet.tags = current.tags;
  if (current.defaultLanguage) snippet.defaultLanguage = current.defaultLanguage;
  return { id: videoId, snippet };
}

export function hasPromo(description: string): boolean {
  return description.includes(PROMO_MARKER) || description.includes(PROMO_MARKER_HE);
}

export async function applyPromoDescription<T extends { body?: string; language?: string; title?: string }>(
  db: GrowthDb,
  item: { id: string; source: string; title: string; language: string; summary?: string; copy?: { article?: { body?: string } } },
  destination: DestinationLike,
  copy: T,
  tokenFor?: (connectionId: string) => Promise<string>,
  now = new Date()
): Promise<T> {
  if (item.source !== "shorts-schedule") return copy;
  const channel = promoChannel(destination);
  if (!channel) return copy;
  const catalog = await catalogFor(db, tokenFor, now);
  const script = item.copy?.article?.body || item.summary || "";
  const featureId = featureIdFromText(item.title, script);
  const recent = readIds(db, "promo_recent");
  const promo = choosePromo({ catalog, channel, featureId, title: item.title, recentIds: recent });
  if (!promo) return copy;
  setSetting(db, `promo_pick:${item.id}`, promo.videoId);
  setSetting(db, "promo_recent", JSON.stringify([...recent, promo.videoId].slice(-24)));
  return { ...copy, body: withPromoDescription(copy.body ?? "", promo, copy.language || item.language) };
}

export function savedPromo(db: GrowthDb, itemId: string): PromoVideo | null {
  const videoId = getSetting(db, `promo_pick:${itemId}`);
  if (!videoId) return null;
  return readCatalog(db).find((video) => video.videoId === videoId) ?? { videoId, title: "Reelmino", featureId: null, publishedAt: "" };
}

export async function advancePromoBackfill(
  db: GrowthDb,
  input: { now?: Date; log?: (message: string) => void; tokenFor?: (connectionId: string) => Promise<string> } = {}
): Promise<void> {
  const now = input.now ?? new Date();
  const log = input.log ?? (() => undefined);
  const day = jerusalemDayStart(now);
  const used = Number(getSetting(db, `promo_backfill_count:${day}`) ?? "0");
  if (used >= promoBackfillPerDay()) return;
  try {
    await catalogFor(db, input.tokenFor, now);
    await refreshUploadCaches(db, input.tokenFor, now);
  } catch (error) {
    log(`promo catalog: ${error instanceof Error ? error.message : String(error)}`);
  }
  const target = nextBackfillTarget(readUploads(db), now, [...readIds(db, "promo_backfill_done"), ...readIds(db, `promo_backfill_skip:${day}`)]);
  if (!target || !input.tokenFor) return;
  const destination = destinationsForNetwork(db, "youtube").find((row) => promoChannel(row) === target.channel && row.enabled);
  if (!destination) return;
  try {
    const token = await input.tokenFor(destination.connectionId);
    const current = await readVideoSnippet(token, target.videoId);
    const featureId = featureIdFromText(target.title, current.description || target.description);
    const promo = choosePromo({
      catalog: readCatalog(db),
      channel: target.channel,
      featureId,
      title: target.title,
      selfVideoId: target.videoId,
      recentIds: readIds(db, "promo_recent")
    });
    if (!promo) return;
    const description = withPromoDescription(current.description || target.description, promo, "en");
    if (description === (current.description || target.description)) {
      markDone(db, target.videoId);
      return;
    }
    await updateVideoSnippet(token, youtubeSnippetUpdate(target.videoId, current, description));
    markDone(db, target.videoId);
    setSetting(db, `promo_backfill_count:${day}`, String(used + 1));
    setSetting(db, "promo_recent", JSON.stringify([...readIds(db, "promo_recent"), promo.videoId].slice(-24)));
    log(`promo backfill ${target.videoId} -> ${promo.videoId}`);
  } catch (error) {
    const skipped = readIds(db, `promo_backfill_skip:${day}`);
    setSetting(db, `promo_backfill_skip:${day}`, JSON.stringify([...skipped, target.videoId]));
    log(`promo backfill ${target.videoId} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function catalogFor(db: GrowthDb, tokenFor: ((connectionId: string) => Promise<string>) | undefined, now: Date): Promise<PromoVideo[]> {
  const cached = readCatalog(db);
  const refreshedAt = Date.parse(getSetting(db, "promo_catalog_at") ?? "");
  if (cached.length && Number.isFinite(refreshedAt) && now.getTime() - refreshedAt < CATALOG_TTL_MS) return cached;
  if (!tokenFor) return cached;
  const attempted = Date.parse(getSetting(db, "promo_refresh_at") ?? "");
  if (Number.isFinite(attempted) && now.getTime() - attempted < CATALOG_TTL_MS && cached.length) return cached;
  setSetting(db, "promo_refresh_at", now.toISOString());
  const destination = destinationsForNetwork(db, "youtube").find((row) => promoChannel(row) === "product" && row.enabled);
  if (!destination) return cached;
  const token = await tokenFor(destination.connectionId);
  const uploads = await listUploads(token, REELMINO_CHANNEL_ID);
  const features = featureIndex(db);
  const catalog = uploads.filter((row) => row.privacy !== "private").map((row) => ({
    videoId: row.videoId,
    title: row.title,
    publishedAt: row.publishedAt,
    featureId: features.get(row.videoId) ?? featureIdFromText(row.title, row.description)
  }));
  setSetting(db, "promo_catalog", JSON.stringify(catalog));
  setSetting(db, "promo_catalog_at", now.toISOString());
  setSetting(db, "promo_uploads:product", JSON.stringify(uploads.map((row) => ({ ...row, channel: "product" }))));
  return catalog;
}

async function refreshUploadCaches(db: GrowthDb, tokenFor: ((connectionId: string) => Promise<string>) | undefined, now: Date): Promise<void> {
  if (!tokenFor) return;
  const refreshedAt = Date.parse(getSetting(db, "promo_uploads_at") ?? "");
  if (Number.isFinite(refreshedAt) && now.getTime() - refreshedAt < CATALOG_TTL_MS) return;
  const kitchen = destinationsForNetwork(db, "youtube").find((row) => promoChannel(row) === "kitchen" && row.enabled);
  if (!kitchen) return;
  const token = await tokenFor(kitchen.connectionId);
  const uploads = await listUploads(token, KITCHEN_CHANNEL_ID);
  setSetting(db, "promo_uploads:kitchen", JSON.stringify(uploads.map((row) => ({ ...row, channel: "kitchen" }))));
  setSetting(db, "promo_uploads_at", now.toISOString());
}

function readCatalog(db: GrowthDb): PromoVideo[] {
  return readJson<PromoVideo[]>(db, "promo_catalog");
}

function readUploads(db: GrowthDb): PromoUpload[] {
  return [...readJson<PromoUpload[]>(db, "promo_uploads:kitchen"), ...readJson<PromoUpload[]>(db, "promo_uploads:product")];
}

function readIds(db: GrowthDb, key: string): string[] {
  return readJson<string[]>(db, key);
}

function readJson<T>(db: GrowthDb, key: string): T {
  const raw = getSetting(db, key);
  if (!raw) return [] as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return [] as T;
  }
}

function markDone(db: GrowthDb, videoId: string): void {
  const done = readIds(db, "promo_backfill_done");
  if (!done.includes(videoId)) setSetting(db, "promo_backfill_done", JSON.stringify([...done, videoId]));
}

function featureIndex(db: GrowthDb): Map<string, string> {
  const rows = db.prepare(
    `SELECT jobs.remote_post_id AS video_id, items.title AS title, items.copy_json AS copy_json
     FROM jobs JOIN items ON items.id = jobs.item_id
     WHERE jobs.network = 'youtube' AND jobs.remote_post_id IS NOT NULL AND items.source = 'shorts-schedule'`
  ).all() as Array<Record<string, unknown>>;
  const index = new Map<string, string>();
  for (const row of rows) {
    const videoId = String(row.video_id ?? "");
    let script = "";
    try {
      script = (JSON.parse(String(row.copy_json ?? "{}")) as { article?: { body?: string } }).article?.body ?? "";
    } catch {
      script = "";
    }
    const featureId = featureIdFromText(String(row.title ?? ""), script);
    if (videoId && featureId) index.set(videoId, featureId);
  }
  return index;
}

function topicScore(title: string, promo: PromoVideo): number {
  const skip = new Set(["with", "from", "this", "that", "your", "reelmino", "video", "short"]);
  const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 4 && !skip.has(word));
  const hay = `${promo.title} ${promo.featureId ?? ""}`.toLowerCase();
  return words.filter((word) => hay.includes(word)).length;
}

type ListedUpload = { videoId: string; title: string; description: string; publishedAt: string; privacy: string };

async function listUploads(token: string, channelId: string): Promise<ListedUpload[]> {
  const channel = await youtubeGet(token, `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}`);
  const uploads = (channel.items as Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> | undefined)?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];
  const page = await youtubeGet(token, `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status&maxResults=50&playlistId=${encodeURIComponent(uploads)}`);
  const items = (page.items ?? []) as Array<{ snippet?: { title?: string; description?: string; publishedAt?: string; resourceId?: { videoId?: string } }; status?: { privacyStatus?: string } }>;
  return items.map((item) => ({
    videoId: item.snippet?.resourceId?.videoId ?? "",
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
    privacy: item.status?.privacyStatus ?? "public"
  })).filter((item) => item.videoId);
}

async function readVideoSnippet(token: string, videoId: string): Promise<{ title: string; description: string; categoryId?: string; tags?: string[]; defaultLanguage?: string }> {
  const data = await youtubeGet(token, `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`);
  const snippet = (data.items as Array<{ snippet?: { title?: string; description?: string; categoryId?: string; tags?: string[]; defaultLanguage?: string } }> | undefined)?.[0]?.snippet;
  if (!snippet?.title) throw new Error(`youtube video ${videoId} has no snippet`);
  return {
    title: snippet.title,
    description: snippet.description ?? "",
    categoryId: snippet.categoryId,
    tags: snippet.tags,
    defaultLanguage: snippet.defaultLanguage
  };
}

async function updateVideoSnippet(token: string, body: { id: string; snippet: Record<string, unknown> }): Promise<void> {
  const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`youtube videos.update ${response.status}`);
}

async function youtubeGet(token: string, url: string): Promise<{ items?: unknown[] }> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`youtube list ${response.status}`);
  return (await response.json()) as { items?: unknown[] };
}
