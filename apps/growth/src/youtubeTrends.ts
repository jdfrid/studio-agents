import { slugify } from "./catalog.js";
import { languageLock, textMatchesLanguage, titleInLanguage } from "./languageCopy.js";
import { emptyCopy, type ItemCopy } from "./copy.js";
import { nid } from "./crypto.js";
import {
  destinationsForNetwork,
  getDestination,
  getItem,
  getJob,
  getSetting,
  getTrendCycle,
  insertItem,
  insertTrendCycle,
  listTrendCycles,
  nextOpenSlot,
  openTrendCycle,
  setSetting,
  trendCycleBySlot,
  trendSlotBuckets,
  updateItem,
  updateTrendCycle,
  flag,
  type Destination,
  type GrowthDb,
  type TrendCycle
} from "./db.js";
import { downloadReelminoFinal, submitReelminoBrief } from "./produce.js";
import { freshConnectionTokens, runPublish } from "./publish.js";

type TrendContext = {
  db: GrowthDb;
  key: Buffer;
  mediaDir: string;
  publicBase: string;
};

export const TREND_HOUR_OPTIONS = [1, 2, 4, 6, 8, 12, 24] as const;

const STOP = new Set([
  "the", "and", "for", "you", "your", "this", "that", "with", "from", "are", "was", "were", "how", "why", "what",
  "when", "who", "its", "it's", "just", "new", "video", "official", "shorts", "youtube",
  "של", "על", "את", "עם", "לא", "כי", "זה", "זו", "גם", "או", "אם", "יש", "מה", "איך", "למה", "אני", "הוא", "היא",
  "הם", "בין", "כל", "עוד", "רק", "אבל", "אז", "כדי", "אחד", "הזה", "הזאת"
]);

const NOISY_CATEGORIES = new Set(["10", "17", "20"]);

const MSG_CHANNEL = "חברו ערוץ יוטיוב פעיל";
const MSG_SESSION = "הגדירו REELMINO_SESSION כדי להפיק סרטון";
const MSG_BUSY = "כבר רץ סרטון מגמה. הוא יסתיים לפני שמתחילים עוד אחד.";
const MSG_TOPIC = "אין נושא חדש שעדיין לא כיסינו";
const MSG_EMPTY = "יוטיוב לא החזיר מגמות לאזור הזה";

export type TrendVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
  categoryId: string | null;
  source: "chart" | "channel";
};

export type TrendSettings = {
  enabled: boolean;
  hours: number;
  region: string;
  language: string;
  niche: string;
  destinationId: string | null;
};

export type YoutubeTrendClient = {
  mostPopular(region: string): Promise<TrendVideo[]>;
  channelVideos(channelId: string): Promise<TrendVideo[]>;
};

export type TrendPublishResult = {
  id: string;
  status: string;
  remoteUrl: string | null;
  lastError?: string | null;
};

export type TrendDeps = {
  now?: Date;
  pollAfterMs?: number;
  client?: YoutubeTrendClient;
  submitBrief?: (brief: Record<string, unknown>) => Promise<string>;
  downloadFinal?: (runId: string, mediaDir: string) => Promise<{ filename: string } | null>;
  publish?: (itemId: string, destination: Destination) => Promise<TrendPublishResult>;
};

type ApiVideo = {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; publishedAt?: string; categoryId?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

const inflight = new Set<string>();

export function trendSlotKey(now: Date, hours: number): string {
  const span = hours * 60 * 60 * 1000;
  return `${hours}h-${Math.floor(now.getTime() / span)}`;
}

export function tokens(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    if (raw.length < 2 || STOP.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export function topicLabel(title: string): string {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => !STOP.has(word.toLowerCase()) && word.length > 1);
  return (kept.length >= 2 ? kept : words).slice(0, 6).join(" ").slice(0, 80);
}

export function attentionScore(video: TrendVideo, now = Date.now()): number {
  const views = Math.log10(video.viewCount + 1);
  const likes = Math.log10(video.likeCount + 1);
  const comments = Math.log10(video.commentCount + 1);
  const engagement = video.viewCount > 0 ? (video.likeCount + video.commentCount * 2) / video.viewCount : 0;
  let recency = 0;
  if (video.publishedAt) {
    const ageHours = (now - Date.parse(video.publishedAt)) / 3_600_000;
    if (ageHours >= 0 && ageHours < 48) recency = 1.2;
    else if (ageHours < 168) recency = 0.4;
  }
  return views * 1.4 + likes * 0.35 + comments * 0.55 + engagement * 8 + recency;
}

export function learnTaste(channelVideos: TrendVideo[], now = Date.now()): Map<string, number> {
  const weights = new Map<string, number>();
  if (!channelVideos.length) return weights;
  const scores = channelVideos.map((video) => attentionScore(video, now)).sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const median = scores.length % 2 ? scores[mid]! : (scores[mid - 1]! + scores[mid]!) / 2;
  for (const video of channelVideos) {
    const weight = attentionScore(video, now) >= median ? 1 : 0.25;
    for (const token of tokens(video.title)) weights.set(token, (weights.get(token) ?? 0) + weight);
  }
  return weights;
}

export function videosFromApi(payload: { items?: ApiVideo[] }, source: TrendVideo["source"]): TrendVideo[] {
  const out: TrendVideo[] = [];
  for (const item of payload.items ?? []) {
    const title = item.snippet?.title?.trim();
    if (!item.id || !title) continue;
    out.push({
      videoId: item.id,
      title,
      channelTitle: item.snippet?.channelTitle?.trim() || "",
      viewCount: Number(item.statistics?.viewCount ?? 0) || 0,
      likeCount: Number(item.statistics?.likeCount ?? 0) || 0,
      commentCount: Number(item.statistics?.commentCount ?? 0) || 0,
      publishedAt: item.snippet?.publishedAt ?? null,
      categoryId: item.snippet?.categoryId ?? null,
      source
    });
  }
  return out;
}

export function playlistVideoIds(payload: { items?: Array<{ snippet?: { resourceId?: { videoId?: string } } }> }): string[] {
  const ids: string[] = [];
  for (const item of payload.items ?? []) {
    const id = item.snippet?.resourceId?.videoId;
    if (id) ids.push(id);
  }
  return ids;
}

export function pickTopic(input: {
  chart: TrendVideo[];
  taste: ReadonlyMap<string, number>;
  recentTokens: string[][];
  recentVideoIds: string[];
  niche: string;
  ownChannel?: string;
  now?: number;
}): { topic: string; score: number; videoId: string; tokens: string[]; inspirationTitle: string } | null {
  const now = input.now ?? Date.now();
  const nicheTokens = tokens(input.niche);
  const used = new Set(input.recentVideoIds);
  const ranked = input.chart
    .filter((video) => video.source !== "channel" && !used.has(video.videoId))
    .filter((video) => !input.ownChannel || video.channelTitle !== input.ownChannel)
    .map((video) => {
      const words = tokens(video.title);
      let score = attentionScore(video, now);
      let fit = 0;
      for (const word of words) fit += input.taste.get(word) ?? 0;
      if (fit > 0) score += Math.min(2.5, fit * 0.45);
      const hits = nicheTokens.filter((word) => words.includes(word)).length;
      if (nicheTokens.length) score += hits * 1.4;
      const noisy = NOISY_CATEGORIES.has(video.categoryId ?? "");
      if (noisy && hits === 0) score *= nicheTokens.length ? 0.25 : 0.35;
      return { video, words, score };
    })
    .filter((row) => row.words.length >= 2)
    .sort((a, b) => b.score - a.score);

  const fresh = ranked.find((row) => !tooClose(row.words, input.recentTokens));
  if (!fresh) return null;
  return {
    topic: topicLabel(fresh.video.title),
    score: fresh.score,
    videoId: fresh.video.videoId,
    tokens: fresh.words.slice(0, 8),
    inspirationTitle: fresh.video.title
  };
}

export function contentForTrend(input: { topic: string; niche: string; language: string }): {
  title: string;
  summary: string;
  description: string;
  brief: Record<string, unknown>;
} {
  const he = input.language.startsWith("he");
  const niche = input.niche.trim();
  const title = titleInLanguage(input.topic, input.language).slice(0, 90);
  const topicInLanguage = textMatchesLanguage(input.topic, input.language);
  const summary = he
    ? `סרטון מקורי קצר${topicInLanguage ? ` על ${input.topic}` : ""}.${niche && textMatchesLanguage(niche, input.language) ? ` הקהל: ${niche}.` : ""} מסבירים למה זה תופס תשומת לב עכשיו, ונותנים טיפ אחד שאפשר ליישם מיד.`
    : `An original short${topicInLanguage ? ` about ${input.topic}` : ""}.${niche && textMatchesLanguage(niche, input.language) ? ` Audience: ${niche}.` : ""} Explain why people are paying attention right now, and give one tip they can use immediately.`;
  const subject = topicInLanguage
    ? ""
    : he
      ? `\nהנושא לכיסוי, בלי להעתיק את הניסוח לכותרת או לתיאור: ${input.topic}`
      : `\nSubject to cover, without copying this wording into the title or the description: ${input.topic}`;
  const instructions = `${he
    ? "תוכן מקורי בלבד. אסור להעתיק סרטון, תסריט, כותרת או קריינות של יוצר אחר. בלי שמות ערוצים, בלי לוגואים של מותג אחר, ובלי לטעון שהסרטון שייך למישהו אחר. פתיח ברור בשלוש השניות הראשונות, קריינות קצרה, מסך אנכי."
    : "Original content only. Do not copy another creator's video, script, title, or narration. No other channel names, no third-party logos, and no claim that this video belongs to someone else. Clear hook in the first three seconds, short narration, vertical frame."} ${languageLock(input.language)}`;
  const tags = ["#Shorts", ...tokens(title).slice(0, 3).map((token) => `#${token}`)];
  const description = `${he ? `${title}. סרטון קצר ומקורי עם טיפ אחד ליישום.` : `${title}. An original short with one practical tip.`}\n\n${tags.join(" ")}`;
  return {
    title,
    summary,
    description,
    brief: {
      title,
      sourceText: summary + subject,
      instructions,
      targetAudience: niche && textMatchesLanguage(niche, input.language) ? niche : (he ? "צופים בסרטונים קצרים ביוטיוב" : "YouTube Shorts viewers"),
      language: input.language,
      durationSeconds: 30,
      aspectRatio: "9:16",
      budgetMode: true,
      approvalMode: "auto"
    }
  };
}

export function readTrendSettings(db: GrowthDb): TrendSettings {
  const hoursRaw = Number(getSetting(db, "youtube_trends_hours") ?? "4");
  const region = (getSetting(db, "youtube_trends_region") ?? "IL").toUpperCase();
  const language = (getSetting(db, "youtube_trends_language") ?? "he").toLowerCase();
  return {
    enabled: flag(db, "youtube_trends_enabled"),
    hours: (TREND_HOUR_OPTIONS as readonly number[]).includes(hoursRaw) ? hoursRaw : 4,
    region: /^[A-Z]{2}$/.test(region) ? region : "IL",
    language: /^[a-z]{2}$/.test(language) ? language : "he",
    niche: (getSetting(db, "youtube_trends_niche") ?? "").slice(0, 200),
    destinationId: getSetting(db, "youtube_trends_destination")?.trim() || null
  };
}

export function applyTrendSettings(
  db: GrowthDb,
  patch: Partial<{ enabled: boolean; hours: number; region: string; language: string; niche: string; destinationId: string | null }>
): string | null {
  if (patch.hours !== undefined && !(TREND_HOUR_OPTIONS as readonly number[]).includes(patch.hours)) {
    return "בחרו מרווח של 1, 2, 4, 6, 8, 12 או 24 שעות";
  }
  if (patch.region !== undefined && !/^[A-Za-z]{2}$/.test(patch.region.trim())) {
    return "אזור חייב להיות קוד מדינה בן שתי אותיות";
  }
  if (patch.language !== undefined && !/^[A-Za-z]{2}$/.test(patch.language.trim())) {
    return "שפה חייבת להיות קוד בן שתי אותיות";
  }
  if (patch.destinationId) {
    const row = getDestination(db, patch.destinationId);
    if (!row || row.network !== "youtube" || row.kind !== "channel" || !row.enabled) return "בחרו ערוץ יוטיוב פעיל";
  }
  if (patch.enabled !== undefined) setSetting(db, "youtube_trends_enabled", patch.enabled ? "1" : "0");
  if (patch.hours !== undefined) setSetting(db, "youtube_trends_hours", String(patch.hours));
  if (patch.region !== undefined) setSetting(db, "youtube_trends_region", patch.region.trim().toUpperCase());
  if (patch.language !== undefined) setSetting(db, "youtube_trends_language", patch.language.trim().toLowerCase());
  if (patch.niche !== undefined) setSetting(db, "youtube_trends_niche", patch.niche.trim().slice(0, 200));
  if (patch.destinationId !== undefined) setSetting(db, "youtube_trends_destination", patch.destinationId ?? "");
  return null;
}

export function createYoutubeTrendClient(accessToken: string, fetchImpl: typeof fetch = fetch): YoutubeTrendClient {
  const get = async <T>(url: string): Promise<T> => {
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}` } });
    const text = await response.text();
    if (!response.ok) throw new Error(`YouTube ${response.status}: ${text.slice(0, 180)}`);
    return JSON.parse(text) as T;
  };
  return {
    async mostPopular(region: string) {
      const data = await get<{ items?: ApiVideo[] }>(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${encodeURIComponent(region)}&maxResults=25`
      );
      return videosFromApi(data, "chart");
    },
    async channelVideos(channelId: string) {
      const channel = await get<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}`
      );
      const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return [];
      const playlist = await get<{ items?: Array<{ snippet?: { resourceId?: { videoId?: string } } }> }>(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(uploads)}&maxResults=20`
      );
      const ids = playlistVideoIds(playlist);
      if (!ids.length) return [];
      const videos = await get<{ items?: ApiVideo[] }>(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.map(encodeURIComponent).join(",")}`
      );
      return videosFromApi(videos, "channel");
    }
  };
}

export async function advanceYoutubeTrends(ctx: TrendContext, deps: TrendDeps = {}): Promise<void> {
  const open = openTrendCycle(ctx.db);
  if (open) await executeCycle(ctx, open, deps);
  if (!readTrendSettings(ctx.db).enabled) return;
  if (openTrendCycle(ctx.db)) return;
  const settings = readTrendSettings(ctx.db);
  const now = deps.now ?? new Date();
  const prefix = `${settings.hours}h-`;
  const bucket = nextOpenSlot(settings.hours, now, trendSlotBuckets(ctx.db, prefix));
  if (bucket === null) return;
  await startCycle(ctx, `${prefix}${bucket}`, deps);
}

export async function runTrendNow(ctx: TrendContext, deps: TrendDeps = {}): Promise<TrendCycle> {
  if (openTrendCycle(ctx.db)) throw new Error(MSG_BUSY);
  const cycle = await startCycle(ctx, `manual-${Date.now()}`, deps);
  if (!cycle) throw new Error(MSG_BUSY);
  return getTrendCycle(ctx.db, cycle.id) ?? cycle;
}

function tooClose(words: string[], recent: string[][]): boolean {
  return recent.some((prev) => {
    const shared = words.filter((word) => prev.includes(word)).length;
    if (shared < 2) return false;
    const union = new Set([...words, ...prev]).size;
    return union > 0 && shared / union >= 0.6;
  });
}

function youtubeChannel(db: GrowthDb, destinationId: string | null): Destination | null {
  if (destinationId) {
    const chosen = getDestination(db, destinationId);
    if (chosen?.network === "youtube" && chosen.kind === "channel" && chosen.enabled) return chosen;
  }
  return destinationsForNetwork(db, "youtube").find((row) => row.enabled && row.kind === "channel") ?? null;
}

function recentMemory(db: GrowthDb): { tokens: string[][]; videoIds: string[] } {
  const tokensets: string[][] = [];
  const videoIds: string[] = [];
  for (const cycle of listTrendCycles(db, 12)) {
    if (Array.isArray(cycle.signal.tokens)) {
      tokensets.push(cycle.signal.tokens.filter((token): token is string => typeof token === "string"));
    }
    if (typeof cycle.signal.inspirationVideoId === "string") videoIds.push(cycle.signal.inspirationVideoId);
  }
  return { tokens: tokensets, videoIds };
}

function trendItemCopy(title: string, description: string): ItemCopy {
  const copy = emptyCopy();
  copy.hashtags = ["Shorts", ...tokens(title).slice(0, 4)];
  copy.youtube = { title: title.slice(0, 90), body: description };
  copy.article = { title, description, body: description };
  return copy;
}

function isUnique(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique/i.test(message);
}

function fail(db: GrowthDb, id: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  updateTrendCycle(db, id, { status: "failed", error: message.slice(0, 500) });
}

async function startCycle(ctx: TrendContext, slot: string, deps: TrendDeps): Promise<TrendCycle | null> {
  const settings = readTrendSettings(ctx.db);
  const destination = youtubeChannel(ctx.db, settings.destinationId);
  if (!destination) return recordTerminal(ctx.db, slot, settings, "failed", MSG_CHANNEL);
  if (!deps.submitBrief && !process.env.REELMINO_SESSION?.trim()) return recordTerminal(ctx.db, slot, settings, "failed", MSG_SESSION);
  try {
    const cycle = insertTrendCycle(ctx.db, {
      id: nid(),
      slotKey: slot,
      status: "sensing",
      language: settings.language,
      region: settings.region,
      niche: settings.niche,
      destinationId: destination.id
    });
    await executeCycle(ctx, cycle, deps);
    return getTrendCycle(ctx.db, cycle.id);
  } catch (error) {
    if (isUnique(error)) return null;
    throw error;
  }
}

function recordTerminal(db: GrowthDb, slot: string, settings: TrendSettings, status: string, error: string): TrendCycle | null {
  try {
    return insertTrendCycle(db, {
      id: nid(),
      slotKey: slot,
      status,
      language: settings.language,
      region: settings.region,
      niche: settings.niche,
      destinationId: settings.destinationId,
      error
    });
  } catch (insertError) {
    if (isUnique(insertError)) return trendCycleBySlot(db, slot);
    throw insertError;
  }
}

async function executeCycle(ctx: TrendContext, cycle: TrendCycle, deps: TrendDeps): Promise<void> {
  if (inflight.has(cycle.id)) return;
  inflight.add(cycle.id);
  try {
    const current = getTrendCycle(ctx.db, cycle.id) ?? cycle;
    if (current.status === "sensing") await senseAndSubmit(ctx, current, deps);
    else if (current.status === "producing") await pullAndPublish(ctx, current, deps);
    else if (current.status === "publishing") await finishPublish(ctx, current, deps);
  } catch (error) {
    fail(ctx.db, cycle.id, error);
  } finally {
    inflight.delete(cycle.id);
  }
}

async function senseAndSubmit(ctx: TrendContext, cycle: TrendCycle, deps: TrendDeps): Promise<void> {
  const settings = readTrendSettings(ctx.db);
  let current = cycle;
  if (!current.topic || !current.itemId || !storedBrief(current)) {
    const destination = current.destinationId ? getDestination(ctx.db, current.destinationId) : null;
    if (!destination) {
      fail(ctx.db, current.id, MSG_CHANNEL);
      return;
    }
    const client = await trendClient(ctx, destination, deps);
    const [chart, channel] = await Promise.all([
      client.mostPopular(current.region || settings.region),
      client.channelVideos(destination.externalId)
    ]);
    if (!chart.length) {
      fail(ctx.db, current.id, MSG_EMPTY);
      return;
    }
    const now = (deps.now ?? new Date()).getTime();
    const memory = recentMemory(ctx.db);
    const taste = learnTaste(channel, now);
    const picked = pickTopic({
      chart,
      taste,
      recentTokens: memory.tokens,
      recentVideoIds: memory.videoIds,
      niche: current.niche || settings.niche,
      ownChannel: destination.name,
      now
    });
    if (!picked) {
      updateTrendCycle(ctx.db, current.id, { status: "skipped", error: MSG_TOPIC, signal: { chartSize: chart.length, channelSize: channel.length } });
      return;
    }
    const content = contentForTrend({
      topic: picked.topic,
      niche: current.niche || settings.niche,
      language: current.language || settings.language
    });
    const item = insertItem(ctx.db, {
      id: nid(),
      slug: slugify(`trend-${current.slotKey}`),
      source: "youtube-trend",
      title: content.title,
      summary: content.summary,
      language: current.language || settings.language,
      copy: trendItemCopy(content.title, content.description),
      mediaPath: null,
      mediaMime: null,
      mediaKind: null,
      mediaWidth: null,
      mediaHeight: null,
      mediaDurationMs: null,
      reelminoRunId: null
    });
    current =
      updateTrendCycle(ctx.db, current.id, {
        topic: picked.topic,
        score: picked.score,
        itemId: item.id,
        signal: {
          tokens: picked.tokens,
          inspirationVideoId: picked.videoId,
          inspirationTitle: picked.inspirationTitle,
          taste: [...taste.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
          chartSize: chart.length,
          channelSize: channel.length,
          brief: content.brief
        }
      }) ?? current;
  }
  if (!current.runId) {
    const brief = storedBrief(current);
    if (!brief || !current.itemId) throw new Error("missing trend brief");
    const runId = await (deps.submitBrief ?? submitReelminoBrief)(brief);
    updateItem(ctx.db, current.itemId, { reelminoRunId: runId });
    updateTrendCycle(ctx.db, current.id, { status: "producing", runId, error: null });
  }
}

async function pullAndPublish(ctx: TrendContext, cycle: TrendCycle, deps: TrendDeps): Promise<void> {
  const pollAfter = deps.pollAfterMs ?? 120_000;
  const updated = Date.parse(cycle.updatedAt);
  if (Number.isFinite(updated) && Date.now() - updated < pollAfter) return;
  if (!cycle.runId || !cycle.itemId) {
    fail(ctx.db, cycle.id, "missing trend run");
    return;
  }
  const file = await (deps.downloadFinal ?? downloadReelminoFinal)(cycle.runId, ctx.mediaDir);
  if (!file) {
    updateTrendCycle(ctx.db, cycle.id, { status: "producing" });
    return;
  }
  updateItem(ctx.db, cycle.itemId, {
    mediaPath: file.filename,
    mediaMime: "video/mp4",
    mediaKind: "video",
    mediaWidth: 1080,
    mediaHeight: 1920,
    mediaDurationMs: 30_000
  });
  const publishing = updateTrendCycle(ctx.db, cycle.id, { status: "publishing", error: null });
  if (publishing) await finishPublish(ctx, publishing, deps);
}

async function finishPublish(ctx: TrendContext, cycle: TrendCycle, deps: TrendDeps): Promise<void> {
  if (cycle.jobId) {
    const job = getJob(ctx.db, cycle.jobId);
    if (!job) {
      fail(ctx.db, cycle.id, "missing upload job");
      return;
    }
    if (job.status === "published" || job.status === "draft") {
      updateTrendCycle(ctx.db, cycle.id, { status: "published", remoteUrl: job.remoteUrl, error: null });
      return;
    }
    if (job.status === "failed") {
      fail(ctx.db, cycle.id, job.lastError || "upload failed");
      return;
    }
    return;
  }
  const destination = cycle.destinationId ? getDestination(ctx.db, cycle.destinationId) : null;
  const item = cycle.itemId ? getItem(ctx.db, cycle.itemId) : null;
  if (!destination || !item) {
    fail(ctx.db, cycle.id, MSG_CHANNEL);
    return;
  }
  const result = deps.publish
    ? await deps.publish(item.id, destination)
    : await runPublish({
        db: ctx.db,
        key: ctx.key,
        mediaDir: ctx.mediaDir,
        publicBase: ctx.publicBase,
        item,
        destination,
        campaign: getSetting(ctx.db, "utm_campaign") ?? undefined
      });
  if (result.status === "published" || result.status === "draft") {
    updateTrendCycle(ctx.db, cycle.id, { status: "published", jobId: result.id, remoteUrl: result.remoteUrl, error: null });
    return;
  }
  if (result.status === "failed") {
    updateTrendCycle(ctx.db, cycle.id, { status: "failed", jobId: result.id, error: (result.lastError || "upload failed").slice(0, 500) });
    return;
  }
  updateTrendCycle(ctx.db, cycle.id, { status: "publishing", jobId: result.id, remoteUrl: result.remoteUrl, error: null });
}

async function trendClient(ctx: TrendContext, destination: Destination, deps: TrendDeps): Promise<YoutubeTrendClient> {
  if (deps.client) return deps.client;
  const tokens = await freshConnectionTokens(ctx.db, destination.connectionId, ctx.key, "youtube");
  return createYoutubeTrendClient(tokens.accessToken);
}

function storedBrief(cycle: TrendCycle): Record<string, unknown> | null {
  const brief = cycle.signal.brief;
  return brief && typeof brief === "object" && !Array.isArray(brief) ? (brief as Record<string, unknown>) : null;
}
