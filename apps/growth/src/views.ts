import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { destinationsForNetwork, getSetting, setSetting, type GrowthDb } from "./db.js";
import { defaultPaths } from "./paths.js";
import { KITCHEN_CHANNEL_ID, REELMINO_CHANNEL_ID } from "./shortsSchedule.js";

/** How often each source is read. Telegram's relay rewrites its file on the same cadence. */
export const VIEWS_INTERVAL_MS = 3 * 60 * 60 * 1000;

export const VIEW_CHANNELS = [
  { id: KITCHEN_CHANNEL_ID, name: "Kitchen Tips" },
  { id: REELMINO_CHANNEL_ID, name: "Reelmino" }
] as const;

const PLAYLIST_PAGES = 40;
const TIKTOK_PAGES = 40;
const VIDEO_BATCH = 50;

const YT_URL = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/;

type Row = Record<string, unknown>;
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type YoutubeVideoStat = {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string | null;
  views: number | null;
};

export type TikTokMetric = {
  postId: string;
  platform: string;
  views: number | null;
  ids?: string[];
  urls?: string[];
  content?: string;
  publishedAt?: string | null;
};

export type TelegramPost = {
  messageId: string | null;
  chatId: string | null;
  youtubeId: string | null;
  views: number | null;
  text: string;
};

export type TelegramGroup = {
  id: string | null;
  name: string;
  members: number | null;
  posts: number | null;
  views: number | null;
};

export type TelegramParse = {
  updatedAt: string | null;
  posts: TelegramPost[];
  groups: TelegramGroup[];
  sawPosts: boolean;
  sawGroups: boolean;
  recognized: boolean;
};

export type ViewsReport = {
  updatedAt: string | null;
  sources: { youtube: string | null; tiktok: string | null; telegram: string | null };
  networks: Array<{ id: "youtube" | "tiktok" | "telegram" | "x"; label: string; views: number | null; paused: boolean; unmapped: number }>;
  channels: Array<{ id: string; name: string; views: number | null }>;
  videos: Array<{
    videoId: string;
    title: string;
    publishedAt: string | null;
    channelId: string;
    channelName: string;
    url: string | null;
    youtube: number | null;
    tiktok: number | null;
    telegram: number | null;
    total: number | null;
  }>;
  groups: Array<{ id: string; name: string; members: number | null; posts: number | null; views: number | null }>;
  series: Array<{ at: string; views: number }>;
};

export type ViewStatsInput = {
  db: GrowthDb;
  now?: Date;
  force?: boolean;
  log?: (message: string) => void;
  tokenFor?: (connectionId: string) => Promise<string>;
  fetchImpl?: FetchLike;
  tiktokPage?: (page: number, fromDate: string, toDate: string) => Promise<unknown>;
  telegramFile?: string;
  youtubeDumpFile?: string;
};

let chain: Promise<void> = Promise.resolve();

export function advanceViewStats(input: ViewStatsInput): Promise<void> {
  const job = chain.then(() => runAdvance(input));
  chain = job.then(
    () => undefined,
    () => undefined
  );
  return job;
}

export function finiteNumber(value: unknown): number | null {
  if (typeof value === "bigint") {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function isVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

export function isChannelId(value: string): boolean {
  return /^UC[A-Za-z0-9_-]{20,}$/.test(value);
}

export function youtubeVideoId(remotePostId: string | null, remoteUrl: string | null): string | null {
  if (remotePostId && isVideoId(remotePostId)) return remotePostId;
  const match = (remoteUrl ?? "").match(YT_URL);
  return match?.[1] ?? null;
}

export function crosspostPostId(detail: string | null): string | null {
  const trimmed = (detail ?? "").trim();
  if (!trimmed || trimmed === "posted") return null;
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as { postId?: unknown; messageId?: unknown };
    const postId = typeof parsed.postId === "string" ? parsed.postId.trim() : "";
    if (postId && postId !== "posted") return postId;
    const messageId = parsed.messageId;
    if (typeof messageId === "number" && Number.isFinite(messageId)) return String(messageId);
    if (typeof messageId === "string" && /^-?\d+$/.test(messageId.trim())) return messageId.trim();
    return null;
  } catch {
    return null;
  }
}

export function channelName(channelId: string): string {
  return VIEW_CHANNELS.find((channel) => channel.id === channelId)?.name ?? (channelId || "");
}

export function knownSum(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value != null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function dateField(row: Record<string, unknown>, keys: string[]): string | null {
  const value = stringField(row, keys);
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in row) || Array.isArray(row[key])) continue;
    const value = finiteNumber(row[key]);
    if (value != null) return value;
  }
  return null;
}

function arrayField(row: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return [];
}

function clip(value: string, max = 300): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function parseYoutubeDump(raw: unknown): { updatedAt: string | null; videos: YoutubeVideoStat[] } {
  const root = asRecord(raw);
  if (!root) return { updatedAt: null, videos: [] };
  const updatedAt = dateField(root, ["updatedAt", "updated_at", "fetchedAt", "fetched_at", "generatedAt", "generated_at"]);
  const videos: YoutubeVideoStat[] = [];
  const channels = root.channels ?? root.channel;
  if (Array.isArray(channels)) {
    for (const channel of channels) {
      const row = asRecord(channel);
      if (!row) continue;
      pushDumpVideos(videos, stringField(row, ["id", "channelId", "channel_id"]) ?? "", arrayField(row, ["videos", "items", "uploads"]));
    }
  } else {
    const map = asRecord(channels);
    if (map) {
      for (const [key, value] of Object.entries(map)) {
        const row = asRecord(value);
        const channelId = isChannelId(key) ? key : stringField(row ?? {}, ["id", "channelId", "channel_id"]) ?? (isChannelId(key) ? key : "");
        const list = Array.isArray(value) ? value : arrayField(row ?? {}, ["videos", "items", "uploads"]);
        pushDumpVideos(videos, isChannelId(key) ? key : channelId, list);
      }
    }
  }
  for (const item of arrayField(root, ["videos", "items"])) {
    const row = asRecord(item);
    if (!row) continue;
    const video = dumpVideo(item, stringField(row, ["channelId", "channel_id"]) ?? "");
    if (video) videos.push(video);
  }
  return { updatedAt, videos: dedupeVideos(videos) };
}

function pushDumpVideos(videos: YoutubeVideoStat[], channelId: string, list: unknown[]): void {
  for (const item of list) {
    const video = dumpVideo(item, channelId);
    if (video) videos.push(video);
  }
}

function dumpVideo(raw: unknown, channelId: string): YoutubeVideoStat | null {
  const row = asRecord(raw);
  if (!row || !isChannelId(channelId)) return null;
  const videoId = stringField(row, ["videoId", "video_id", "id"]) ?? "";
  if (!isVideoId(videoId)) return null;
  const stats = asRecord(row.statistics);
  const views = firstNumber(row, ["views", "viewCount", "view_count"]) ?? (stats ? firstNumber(stats, ["viewCount", "views", "view_count"]) : null);
  if (views == null) return null;
  return {
    videoId,
    channelId,
    title: clip(stringField(row, ["title", "name"]) ?? ""),
    publishedAt: dateField(row, ["publishedAt", "published_at", "published"]),
    views
  };
}

function dedupeVideos(videos: YoutubeVideoStat[]): YoutubeVideoStat[] {
  const byId = new Map<string, YoutubeVideoStat>();
  for (const video of videos) byId.set(video.videoId, video);
  return [...byId.values()];
}

export async function fetchYoutubeUploadStats(token: string, channelId: string, fetchImpl: FetchLike): Promise<YoutubeVideoStat[]> {
  const channel = await youtubeGet(fetchImpl, token, `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}`);
  const uploads = nestedUploads(channel);
  if (!uploads) throw new Error(`youtube channel ${channelId} has no uploads playlist`);
  const listed: Array<{ videoId: string; title: string; publishedAt: string | null }> = [];
  let pageToken = "";
  const seenPages = new Set<string>();
  for (let page = 0; page < PLAYLIST_PAGES; page += 1) {
    if (pageToken && seenPages.has(pageToken)) break;
    if (pageToken) seenPages.add(pageToken);
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploads)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const data = await youtubeGet(fetchImpl, token, url);
    for (const item of arrayField(data, ["items"])) {
      const row = asRecord(item);
      if (!row) continue;
      const snippet = asRecord(row.snippet);
      const content = asRecord(row.contentDetails);
      const resource = asRecord(snippet?.resourceId);
      const videoId = stringField(resource ?? {}, ["videoId"]) ?? stringField(content ?? {}, ["videoId"]) ?? "";
      if (!isVideoId(videoId)) continue;
      listed.push({
        videoId,
        title: clip(stringField(snippet ?? {}, ["title"]) ?? ""),
        publishedAt: dateField(content ?? {}, ["videoPublishedAt"]) ?? dateField(snippet ?? {}, ["publishedAt"])
      });
    }
    pageToken = stringField(data, ["nextPageToken"]) ?? "";
    if (!pageToken) break;
  }
  const stats = new Map<string, { views: number | null; title: string; publishedAt: string | null }>();
  for (let index = 0; index < listed.length; index += VIDEO_BATCH) {
    const batch = listed.slice(index, index + VIDEO_BATCH);
    const data = await youtubeGet(
      fetchImpl,
      token,
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${batch.map((video) => encodeURIComponent(video.videoId)).join(",")}`
    );
    for (const item of arrayField(data, ["items"])) {
      const row = asRecord(item);
      if (!row) continue;
      const videoId = stringField(row, ["id"]) ?? "";
      if (!isVideoId(videoId)) continue;
      const statistics = asRecord(row.statistics);
      const snippet = asRecord(row.snippet);
      stats.set(videoId, {
        views: statistics ? firstNumber(statistics, ["viewCount"]) : null,
        title: clip(stringField(snippet ?? {}, ["title"]) ?? ""),
        publishedAt: dateField(snippet ?? {}, ["publishedAt"])
      });
    }
  }
  return listed.map((video) => {
    const live = stats.get(video.videoId);
    return {
      videoId: video.videoId,
      channelId,
      title: live?.title || video.title,
      publishedAt: live?.publishedAt ?? video.publishedAt,
      views: live ? live.views : null
    };
  });
}

function nestedUploads(channel: Record<string, unknown>): string {
  const item = asRecord(arrayField(channel, ["items"])[0]);
  const details = asRecord(item?.contentDetails);
  const playlists = asRecord(details?.relatedPlaylists);
  return stringField(playlists ?? {}, ["uploads"]) ?? "";
}

async function youtubeGet(fetchImpl: FetchLike, token: string, url: string): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`youtube ${response.status}`);
  const data = asRecord(await response.json());
  if (!data) throw new Error("youtube response was empty");
  return data;
}

export function tiktokPostsFromPayload(payload: unknown): { posts: TikTokMetric[]; pages: number | null } {
  const root = asRecord(payload);
  const list = root ? arrayField(root, ["posts", "items"]) : Array.isArray(payload) ? payload : [];
  const pagination = asRecord(root?.pagination);
  const pages = pagination ? finiteNumber(pagination.pages ?? pagination.pageCount) : null;
  const posts: TikTokMetric[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const ids = zernioIds(row);
    const postId = ids[0] ?? "";
    if (!postId || postId === "posted") continue;
    const analytics = asRecord(row.analytics);
    posts.push({
      postId,
      ids,
      urls: zernioUrls(row),
      content: stringField(row, ["content", "caption", "text"]) ?? "",
      publishedAt: dateField(row, ["publishedAt", "published_at"]),
      platform: (stringField(row, ["platform"]) ?? "").toLowerCase(),
      views: (analytics ? firstNumber(analytics, ["views", "viewCount", "view_count"]) : null) ?? firstNumber(row, ["views", "viewCount"])
    });
  }
  return { posts, pages };
}

export async function collectTikTokPosts(load: (page: number) => Promise<unknown>): Promise<TikTokMetric[]> {
  const all: TikTokMetric[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= TIKTOK_PAGES; page += 1) {
    const parsed = tiktokPostsFromPayload(await load(page));
    let added = 0;
    for (const post of parsed.posts) {
      if (post.platform && post.platform !== "tiktok") continue;
      if (seen.has(post.postId)) continue;
      seen.add(post.postId);
      all.push(post);
      added += 1;
    }
    if (added === 0) break;
    if (parsed.pages != null && page >= parsed.pages) break;
    if (parsed.posts.length < 50) break;
  }
  return all;
}

const ZERNIO_ID_KEYS = ["_id", "id", "postId", "post_id", "platformPostId", "platform_post_id", "originalPostId", "original_post_id", "sourcePostId", "source_post_id", "latePostId"];

function zernioIds(row: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (!id || id === "posted") return;
    if (!ids.includes(id)) ids.push(id);
  };
  for (const key of ZERNIO_ID_KEYS) add(row[key]);
  for (const item of arrayField(row, ["platforms"])) {
    const platform = asRecord(item);
    if (!platform) continue;
    for (const key of ZERNIO_ID_KEYS) add(platform[key]);
  }
  return ids;
}

function zernioUrls(row: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string" || !/tiktok\.com\//i.test(value)) return;
    const url = tiktokUrlKey(value);
    if (url && !urls.includes(url)) urls.push(url);
  };
  for (const key of ["platformPostUrl", "platform_post_url", "url", "postUrl", "post_url"]) add(row[key]);
  for (const item of arrayField(row, ["platforms"])) {
    const platform = asRecord(item);
    if (!platform) continue;
    for (const key of ["platformPostUrl", "platform_post_url", "url", "postUrl"]) add(platform[key]);
  }
  return urls;
}

export function tiktokUrlKey(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return `${parsed.hostname.replace(/^www\./i, "").toLowerCase()}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return trimmed.replace(/[?#].*$/, "").replace(/\/$/, "").replace(/^https?:\/\/(?:www\.)?/i, "").toLowerCase();
  }
}

const POST_KEYS = ["posts", "messages", "channel_posts", "channelPosts", "items"];
const GROUP_KEYS = ["groups", "group_list", "groupList", "chats", "dialogs"];

export function parseTelegramViews(raw: unknown): TelegramParse {
  const root = asRecord(raw);
  if (!root) return emptyTelegram();
  const posts: TelegramPost[] = [];
  const groups: TelegramGroup[] = [];
  let sawPosts = false;
  let sawGroups = false;
  const takePosts = (list: unknown, parentChatId: string | null) => {
    if (!Array.isArray(list)) return;
    sawPosts = true;
    for (const item of list) {
      const post = asTelegramPost(item, parentChatId);
      if (post) posts.push(post);
    }
  };
  const takeGroups = (list: unknown) => {
    if (!Array.isArray(list)) return;
    sawGroups = true;
    for (const item of list) {
      const group = asTelegramGroup(item);
      if (group) groups.push(group);
    }
  };
  for (const key of POST_KEYS) if (key in root) takePosts(root[key], null);
  for (const key of GROUP_KEYS) if (key in root) takeGroups(root[key]);
  for (const key of ["sourceChannel", "source_channel", "channel"]) {
    const channel = asRecord(root[key]);
    if (!channel) continue;
    const chatId = channelChatId(channel);
    for (const postKey of POST_KEYS) if (postKey in channel) takePosts(channel[postKey], chatId);
  }
  if (Array.isArray(root.channels)) {
    for (const item of root.channels) {
      const row = asRecord(item);
      if (!row) continue;
      const chatId = channelChatId(row);
      for (const key of POST_KEYS) if (key in row) takePosts(row[key], chatId);
    }
  }
  return {
    updatedAt: dateField(root, ["exportedAt", "exported_at", "updatedAt", "updated_at", "fetchedAt", "fetched_at", "generatedAt", "generated_at", "timestamp"]),
    posts: dedupePosts(posts),
    groups,
    sawPosts,
    sawGroups,
    recognized: sawPosts || sawGroups
  };
}

function emptyTelegram(): TelegramParse {
  return { updatedAt: null, posts: [], groups: [], sawPosts: false, sawGroups: false, recognized: false };
}

function asTelegramPost(raw: unknown, parentChatId: string | null): TelegramPost | null {
  const row = asRecord(raw);
  if (!row || firstNumber(row, ["members", "member_count", "memberCount", "participants", "participants_count"]) != null) return null;
  const text = postText(row);
  const explicit = stringField(row, ["youtubeId", "youtube_id", "videoId", "video_id", "yt_id"]) ?? "";
  const fromText = text.match(YT_URL)?.[1] ?? "";
  let youtubeId = isVideoId(explicit) ? explicit : isVideoId(fromText) ? fromText : null;
  const messageRaw = row.message_id ?? row.messageId ?? row.msg_id ?? row.id;
  let messageId: string | null = null;
  if (typeof messageRaw === "number" && Number.isFinite(messageRaw)) messageId = String(Math.trunc(messageRaw));
  else if (typeof messageRaw === "string" && /^-?\d+$/.test(messageRaw.trim())) messageId = messageRaw.trim();
  else if (typeof messageRaw === "string" && isVideoId(messageRaw.trim()) && !youtubeId) youtubeId = messageRaw.trim();
  const views = firstNumber(row, ["views", "view_count", "viewCount"]);
  if (!messageId && !youtubeId && views == null) return null;
  return { messageId, chatId: stringField(row, ["chat_id", "chatId", "channel_id", "channelId"]) ?? parentChatId, youtubeId, views, text: clip(text, 500) };
}

function channelChatId(row: Record<string, unknown>): string | null {
  return stringField(row, ["chat_id", "chatId", "channel_id", "channelId", "id"]);
}

function postText(row: Record<string, unknown>): string {
  const direct = stringField(row, ["text", "caption", "message", "content", "body", "message_text"]);
  if (direct) return direct;
  const value = row.text ?? row.caption ?? row.message ?? row.content;
  if (!Array.isArray(value)) return "";
  return value.map((part) => (typeof part === "string" ? part : stringField(asRecord(part) ?? {}, ["text", "content"]) ?? "")).join("");
}

export function titleInText(text: string, title: string): boolean {
  const heading = title.replace(/\s+/g, " ").trim();
  const body = text.replace(/\s+/g, " ").trim();
  if (heading.length < 4 || body.length < heading.length) return false;
  return body === heading || body.startsWith(`${heading} `);
}

function asTelegramGroup(raw: unknown): TelegramGroup | null {
  const row = asRecord(raw);
  if (!row) return null;
  const name = clip(stringField(row, ["name", "title", "group_name", "groupName"]) ?? "", 200);
  if (!name) return null;
  const posts = countOrLength(row, ["posts_sent", "postsSent", "post_count", "postCount", "messages_sent", "sent", "posts", "messages"]);
  return {
    id: stringField(row, ["id", "chat_id", "chatId"]),
    name,
    members: firstNumber(row, ["members", "member_count", "memberCount", "participants", "participants_count", "subscribers"]),
    posts,
    views: firstNumber(row, ["views", "view_count", "viewCount"])
  };
}

function countOrLength(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in row)) continue;
    const value = row[key];
    if (Array.isArray(value)) return value.length;
    const count = finiteNumber(value);
    if (count != null) return count;
  }
  return null;
}

function dedupePosts(posts: TelegramPost[]): TelegramPost[] {
  const seen = new Set<string>();
  const out: TelegramPost[] = [];
  for (const post of posts) {
    const key = `${post.chatId ?? ""}|${post.messageId ?? ""}|${post.youtubeId ?? ""}|${post.views ?? ""}|${post.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(post);
  }
  return out;
}

export type TelegramLoad =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "unrecognized" }
  | { status: "ok"; parsed: TelegramParse; updatedAt: string };

export function loadTelegramViews(file: string): TelegramLoad {
  if (!file || !existsSync(file)) return { status: "missing" };
  let mtime = "";
  try {
    mtime = statSync(file).mtime.toISOString();
  } catch {
    return { status: "missing" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { status: "invalid" };
  }
  const parsed = parseTelegramViews(raw);
  if (!parsed.recognized) return { status: "unrecognized" };
  return { status: "ok", parsed, updatedAt: parsed.updatedAt ?? mtime };
}

type VideoLink = {
  postId: string | null;
  ids: string[];
  tiktokUrl: string | null;
  messageId: string | null;
  chatId: string | null;
  youtubeId: string | null;
  title: string;
  publishedAt: string | null;
  createdAt: string | null;
  channelId: string;
};

function loadLinks(db: GrowthDb, networkSql: string, networkArgs: unknown[]): VideoLink[] {
  const records = rows(db.prepare(
    `SELECT c.network AS network, c.detail AS detail, c.created_at AS created_at, j.remote_post_id AS remote_post_id, j.remote_url AS remote_url,
            j.published_at AS published_at, i.title AS title, d.external_id AS external_id
     FROM growth_crossposts c
     JOIN jobs j ON j.id = c.job_id
     LEFT JOIN items i ON i.id = j.item_id
     LEFT JOIN destinations d ON d.id = j.destination_id
     WHERE c.status = 'posted' AND ${networkSql}`
  ).all(...networkArgs));
  return records.map((row) => {
    const detail = String(row.detail ?? "");
    const network = String(row.network ?? "");
    const externalId = String(row.external_id ?? "");
    const stored = storedCrosspost(detail);
    const chatId = network.startsWith("telegram:") ? network.slice("telegram:".length).trim() || null : null;
    return {
      postId: stored.ids[0] ?? null,
      ids: stored.ids,
      tiktokUrl: stored.url,
      messageId: /^-?\d+$/.test(detail.trim()) ? detail.trim() : stored.ids.find((id) => /^-?\d+$/.test(id)) ?? null,
      chatId,
      youtubeId: youtubeVideoId(String(row.remote_post_id ?? "") || null, String(row.remote_url ?? "") || null),
      title: clip(String(row.title ?? "")),
      publishedAt: dateField(row, ["published_at"]),
      createdAt: dateField(row, ["created_at"]),
      channelId: isChannelId(externalId) ? externalId : ""
    };
  });
}

function storedCrosspost(detail: string): { ids: string[]; url: string | null } {
  const ids: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (!id || id === "posted" || ids.includes(id)) return;
    ids.push(id);
  };
  let url: string | null = null;
  if (detail.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(detail) as Record<string, unknown>;
      for (const key of ["postId", "platformPostId", "id"]) add(parsed[key]);
      if (typeof parsed.platformPostUrl === "string") url = tiktokUrlKey(parsed.platformPostUrl);
    } catch {
      add(detail);
    }
  } else {
    add(crosspostPostId(detail));
  }
  return { ids, url };
}

function knownTitles(db: GrowthDb, links: VideoLink[]): Array<{ youtubeId: string; title: string; link?: VideoLink }> {
  const found = new Map<string, { youtubeId: string; title: string; link?: VideoLink }>();
  const add = (youtubeId: string, title: string, link?: VideoLink) => {
    const heading = title.replace(/\s+/g, " ").trim();
    if (!isVideoId(youtubeId) || heading.length < 4) return;
    const key = `${youtubeId}\n${heading.toLowerCase()}`;
    if (!found.has(key)) found.set(key, { youtubeId, title: heading, link });
  };
  for (const link of links) if (link.youtubeId) add(link.youtubeId, link.title, link);
  for (const row of rows(db.prepare("SELECT video_id, title FROM view_videos").all())) add(String(row.video_id ?? ""), String(row.title ?? ""));
  return [...found.values()];
}

function matchVideoTitle(text: string, titles: Array<{ youtubeId: string; title: string; link?: VideoLink }>): { youtubeId: string; title: string; link?: VideoLink } | undefined {
  const hits = titles.filter((item) => titleInText(text, item.title));
  if (!hits.length) return undefined;
  const longest = hits.reduce((best, item) => Math.max(best, item.title.length), 0);
  const best = hits.filter((item) => item.title.length === longest);
  const videos = new Set(best.map((item) => item.youtubeId));
  if (videos.size !== 1) return undefined;
  return best[0];
}

function messageLink(links: VideoLink[], post: TelegramPost): VideoLink | undefined {
  if (!post.messageId) return undefined;
  const matches = links.filter((link) => link.messageId === post.messageId && link.youtubeId && (!post.chatId || link.chatId === post.chatId));
  const videos = new Set(matches.map((link) => link.youtubeId));
  if (videos.size !== 1) return undefined;
  return matches[0];
}

function rows(value: unknown[]): Row[] {
  return value as Row[];
}

export function saveYoutubeVideos(db: GrowthDb, videos: YoutubeVideoStat[], now: Date): void {
  const statement = db.prepare(
    `INSERT INTO view_videos (video_id, channel_id, title, published_at, youtube_views, tiktok_views, telegram_views, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
     ON CONFLICT(video_id) DO UPDATE SET
       channel_id = excluded.channel_id,
       title = CASE WHEN excluded.title != '' THEN excluded.title ELSE view_videos.title END,
       published_at = COALESCE(excluded.published_at, view_videos.published_at),
       youtube_views = COALESCE(excluded.youtube_views, view_videos.youtube_views),
       updated_at = excluded.updated_at`
  );
  withTransaction(db, () => {
    for (const video of videos) {
      if (!isVideoId(video.videoId) || !isChannelId(video.channelId)) continue;
      statement.run(video.videoId, video.channelId, clip(video.title), video.publishedAt, video.views, now.toISOString());
    }
  });
}

export function applyTikTokViews(db: GrowthDb, posts: TikTokMetric[], now: Date): { views: number | null; unmapped: number } {
  const links = loadLinks(db, "c.network = ?", ["zernio:tiktok"]);
  const perVideo = new Map<string, { views: number; link: VideoLink }>();
  const stamp = now.toISOString();
  const upsertUnmapped = db.prepare(
    `INSERT INTO view_unmapped (source, post_id, views, updated_at) VALUES ('tiktok', ?, ?, ?)
     ON CONFLICT(source, post_id) DO UPDATE SET views = excluded.views, updated_at = excluded.updated_at`
  );
  const deleteUnmapped = db.prepare("DELETE FROM view_unmapped WHERE source = 'tiktok' AND post_id = ?");
  for (const post of posts) {
    if (post.platform && post.platform !== "tiktok") continue;
    const link = matchTikTokPost(post, links);
    if (!link?.youtubeId) {
      if (post.views != null) upsertUnmapped.run(post.postId, post.views, stamp);
      continue;
    }
    deleteUnmapped.run(post.postId);
    for (const id of post.ids ?? [post.postId]) deleteUnmapped.run(id);
    if (post.views == null) continue;
    const current = perVideo.get(link.youtubeId);
    perVideo.set(link.youtubeId, { views: (current?.views ?? 0) + post.views, link });
  }
  for (const [videoId, entry] of perVideo) rememberNetworkViews(db, videoId, "tiktok_views", entry.views, entry.link, stamp);
  return tiktokTotals(db);
}

export function matchTikTokPost(post: TikTokMetric, links: VideoLink[]): VideoLink | undefined {
  const ids = new Set((post.ids?.length ? post.ids : [post.postId]).map((id) => id.toLowerCase()));
  const byId = links.find((link) => link.youtubeId && link.ids.some((id) => ids.has(id.toLowerCase())));
  if (byId) return byId;
  const urls = new Set(post.urls ?? []);
  const byUrl = urls.size ? links.find((link) => link.youtubeId && link.tiktokUrl && urls.has(link.tiktokUrl)) : undefined;
  if (byUrl) return byUrl;
  return matchCaption(post.content ?? "", post.publishedAt ?? null, links);
}

function matchCaption(content: string, publishedAt: string | null, links: VideoLink[]): VideoLink | undefined {
  const hits = links.filter((link) => link.youtubeId && titleInText(content, link.title) && withinHours(publishedAt, link.createdAt, 3));
  const videos = new Set(hits.map((link) => link.youtubeId));
  if (videos.size !== 1) return undefined;
  return hits[0];
}

function withinHours(left: string | null, right: string | null, hours: number): boolean {
  const start = Date.parse(left ?? "");
  const end = Date.parse(right ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return Math.abs(start - end) <= hours * 60 * 60 * 1000;
}

function rememberNetworkViews(db: GrowthDb, videoId: string, column: "tiktok_views" | "telegram_views", views: number, link: VideoLink | undefined, stamp: string): void {
  const existing = db.prepare("SELECT video_id FROM view_videos WHERE video_id = ?").get(videoId);
  if (!existing) {
    db.prepare(
      `INSERT INTO view_videos (video_id, channel_id, title, published_at, youtube_views, tiktok_views, telegram_views, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
    ).run(
      videoId,
      link?.channelId ?? "",
      link?.title || videoId,
      link?.publishedAt ?? null,
      column === "tiktok_views" ? views : null,
      column === "telegram_views" ? views : null,
      stamp
    );
    return;
  }
  db.prepare(`UPDATE view_videos SET ${column} = ?, updated_at = ? WHERE video_id = ?`).run(views, stamp, videoId);
}

export function applyTelegramViews(db: GrowthDb, parsed: TelegramParse, now: Date): { views: number | null; unmapped: number } {
  const links = loadLinks(db, "c.network LIKE ?", ["telegram:%"]);
  const titles = knownTitles(db, links);
  const measured = parsed.posts.filter((post) => post.views != null);
  const perVideo = new Map<string, { views: number; link?: VideoLink; title: string }>();
  for (const post of measured) {
    const linkedByVideo = post.youtubeId ? links.find((item) => item.youtubeId === post.youtubeId) : undefined;
    const linkedByMessage = linkedByVideo ? undefined : messageLink(links, post);
    const linkedByTitle = post.youtubeId || linkedByMessage?.youtubeId ? undefined : matchVideoTitle(post.text, titles);
    const link = linkedByVideo ?? linkedByMessage ?? linkedByTitle?.link;
    const youtubeId = post.youtubeId || link?.youtubeId || linkedByTitle?.youtubeId || null;
    if (!youtubeId || post.views == null) continue;
    const current = perVideo.get(youtubeId);
    perVideo.set(youtubeId, {
      views: (current?.views ?? 0) + post.views,
      link: link ?? current?.link,
      title: link?.title || linkedByTitle?.title || current?.title || clip(post.text, 140)
    });
  }
  const replaceVideoCounts = measured.length > 0 || (parsed.sawPosts && parsed.posts.length === 0);
  if (replaceVideoCounts) {
    const stamp = now.toISOString();
    withTransaction(db, () => {
      db.prepare("UPDATE view_videos SET telegram_views = NULL").run();
      for (const [videoId, entry] of perVideo) {
        rememberNetworkViews(db, videoId, "telegram_views", entry.views, entry.link ?? {
          postId: null,
          ids: [],
          tiktokUrl: null,
          messageId: null,
          chatId: null,
          youtubeId: videoId,
          title: entry.title,
          publishedAt: null,
          createdAt: null,
          channelId: ""
        }, stamp);
      }
    });
  }
  if (parsed.sawGroups) {
    const insert = db.prepare(
      `INSERT INTO view_groups (group_key, name, members, posts, views, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    );
    withTransaction(db, () => {
      db.prepare("DELETE FROM view_groups").run();
      parsed.groups.forEach((group, index) => {
        const key = (group.id || `name:${group.name}:${index}`).slice(0, 160);
        insert.run(key, group.name, group.members, group.posts, group.views, now.toISOString());
      });
    });
  }
  const views = knownSum(measured.map((post) => post.views));
  const mapped = [...perVideo.values()].reduce((sum, entry) => sum + entry.views, 0);
  const unmapped = views == null ? 0 : Math.max(0, views - mapped);
  const observed = measured.length > 0 || (parsed.sawPosts && parsed.posts.length === 0);
  if (observed) {
    setSetting(db, "views_telegram_total", views == null ? "" : String(views));
    setSetting(db, "views_telegram_unmapped", String(unmapped));
  }
  return { views: observed ? views : null, unmapped };
}

export function recordViewSnapshot(
  db: GrowthDb,
  at: Date,
  measured: { youtube?: number | null; tiktok?: number | null; telegram?: number | null; channels?: Record<string, number | null> }
): void {
  const fresh = [measured.youtube, measured.tiktok, measured.telegram].some((value) => value != null);
  if (!fresh) return;
  const takenAt = at.toISOString();
  const insert = db.prepare("INSERT OR REPLACE INTO view_snapshots (taken_at, scope, views) VALUES (?, ?, ?)");
  let total = 0;
  let any = false;
  for (const name of ["youtube", "tiktok", "telegram"] as const) {
    const value = measured[name];
    const carried = value != null ? value : lastSnapshot(db, `network:${name}`);
    if (value != null) insert.run(takenAt, `network:${name}`, value);
    if (carried != null) {
      total += carried;
      any = true;
    }
  }
  for (const [channelId, views] of Object.entries(measured.channels ?? {})) {
    if (views != null) insert.run(takenAt, `channel:${channelId}`, views);
  }
  if (any) insert.run(takenAt, "total", total);
}

function lastSnapshot(db: GrowthDb, scope: string): number | null {
  const row = db.prepare("SELECT views FROM view_snapshots WHERE scope = ? ORDER BY taken_at DESC LIMIT 1").get(scope) as Row | undefined;
  return row ? finiteNumber(row.views) : null;
}

export function viewsReport(db: GrowthDb): ViewsReport {
  const sources = {
    youtube: settingTime(db, "views_youtube_at"),
    tiktok: settingTime(db, "views_tiktok_at"),
    telegram: settingTime(db, "views_telegram_at")
  };
  const stamps = [sources.youtube, sources.tiktok, sources.telegram].map((value) => Date.parse(value ?? "")).filter((value) => Number.isFinite(value));
  const videos = rows(db.prepare(
    `SELECT video_id, channel_id, title, published_at, youtube_views, tiktok_views, telegram_views
     FROM view_videos
     ORDER BY CASE WHEN published_at IS NULL OR published_at = '' THEN 1 ELSE 0 END, published_at DESC, title`
  ).all()).map((row) => {
    const youtube = finiteNumber(row.youtube_views);
    const tiktok = finiteNumber(row.tiktok_views);
    const telegram = finiteNumber(row.telegram_views);
    const videoId = String(row.video_id ?? "");
    const channelId = String(row.channel_id ?? "");
    return {
      videoId,
      title: String(row.title ?? ""),
      publishedAt: String(row.published_at ?? "") || null,
      channelId,
      channelName: channelName(channelId),
      url: isVideoId(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null,
      youtube,
      tiktok,
      telegram,
      total: knownSum([youtube, tiktok, telegram])
    };
  });
  const tiktok = tiktokTotals(db);
  const telegramTotal = settingCount(db, "views_telegram_total");
  return {
    updatedAt: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null,
    sources,
    networks: [
      { id: "youtube", label: "YouTube", views: countSum(db, "SELECT SUM(youtube_views) AS views, COUNT(youtube_views) AS n FROM view_videos"), paused: false, unmapped: 0 },
      { id: "tiktok", label: "TikTok", views: tiktok.views, paused: false, unmapped: tiktok.unmapped },
      { id: "telegram", label: "Telegram", views: telegramTotal, paused: false, unmapped: settingCount(db, "views_telegram_unmapped") ?? 0 },
      { id: "x", label: "X", views: null, paused: true, unmapped: 0 }
    ],
    channels: VIEW_CHANNELS.map((channel) => ({
      id: channel.id,
      name: channel.name,
      views: countSum(db, "SELECT SUM(youtube_views) AS views, COUNT(youtube_views) AS n FROM view_videos WHERE channel_id = ?", [channel.id])
    })),
    videos,
    groups: rows(db.prepare("SELECT group_key, name, members, posts, views FROM view_groups ORDER BY name").all()).map((row) => ({
      id: String(row.group_key ?? ""),
      name: String(row.name ?? ""),
      members: finiteNumber(row.members),
      posts: finiteNumber(row.posts),
      views: finiteNumber(row.views)
    })),
    series: rows(db.prepare("SELECT taken_at, views FROM view_snapshots WHERE scope = 'total' ORDER BY taken_at").all()).flatMap((row) => {
      const views = finiteNumber(row.views);
      const at = String(row.taken_at ?? "");
      return views == null || !at ? [] : [{ at, views }];
    })
  };
}

function tiktokTotals(db: GrowthDb): { views: number | null; unmapped: number } {
  const mapped = countSum(db, "SELECT SUM(tiktok_views) AS views, COUNT(tiktok_views) AS n FROM view_videos");
  const loose = countSum(db, "SELECT SUM(views) AS views, COUNT(views) AS n FROM view_unmapped WHERE source = 'tiktok'");
  return { views: knownSum([mapped, loose]), unmapped: loose ?? 0 };
}

function countSum(db: GrowthDb, sql: string, args: unknown[] = []): number | null {
  const row = db.prepare(sql).get(...args) as Row | undefined;
  if (!row || finiteNumber(row.n) === 0) return null;
  return finiteNumber(row.views);
}

function settingTime(db: GrowthDb, key: string): string | null {
  const value = getSetting(db, key);
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function settingCount(db: GrowthDb, key: string): number | null {
  const value = getSetting(db, key);
  if (value == null || value === "") return null;
  return finiteNumber(value);
}

function recentlyTried(db: GrowthDb, key: string, now: Date, force: boolean): boolean {
  if (force) return false;
  const last = Date.parse(getSetting(db, key) ?? "");
  return Number.isFinite(last) && now.getTime() - last < VIEWS_INTERVAL_MS;
}

async function runAdvance(input: ViewStatsInput): Promise<void> {
  const now = input.now ?? new Date();
  const log = input.log ?? (() => undefined);
  const measured: { youtube?: number | null; tiktok?: number | null; telegram?: number | null; channels?: Record<string, number | null> } = {};
  try {
    const youtube = await refreshYoutube(input, now, log);
    if (youtube.views != null) {
      measured.youtube = youtube.views;
      measured.channels = youtube.channels;
    }
  } catch (error) {
    log(`views youtube failed: ${error instanceof Error ? error.message : "request failed"}`);
  }
  try {
    const tiktok = await refreshTikTok(input, now, log);
    if (tiktok != null) measured.tiktok = tiktok;
  } catch (error) {
    log(`views tiktok failed: ${error instanceof Error ? error.message : "request failed"}`);
  }
  try {
    const telegram = refreshTelegram(input, now, log);
    if (telegram != null) measured.telegram = telegram;
  } catch (error) {
    log(`views telegram failed: ${error instanceof Error ? error.message : "request failed"}`);
  }
  recordViewSnapshot(input.db, now, measured);
}

async function refreshYoutube(input: ViewStatsInput, now: Date, log: (message: string) => void): Promise<{ views: number | null; channels: Record<string, number | null>; at: Date | null }> {
  const empty = { views: null, channels: {}, at: null as Date | null };
  if (recentlyTried(input.db, "views_youtube_try_at", now, Boolean(input.force))) return empty;
  setSetting(input.db, "views_youtube_try_at", now.toISOString());
  const fetchImpl = input.fetchImpl ?? liveFetch;
  let fetched = false;
  if (input.tokenFor) {
    for (const channel of VIEW_CHANNELS) {
      const videos = await fetchChannel(input.db, input.tokenFor, channel.id, channel.name, fetchImpl, log);
      if (!videos) continue;
      fetched = true;
      saveYoutubeVideos(input.db, videos, now);
      log(`views youtube ${channel.name} videos=${videos.length}`);
    }
  }
  if (fetched) {
    const views = countSum(input.db, "SELECT SUM(youtube_views) AS views, COUNT(youtube_views) AS n FROM view_videos");
    if (views != null) setSetting(input.db, "views_youtube_at", now.toISOString());
    return { views, channels: channelSums(input.db), at: views == null ? null : now };
  }
  return readDump(input, now, log) ?? empty;
}

async function fetchChannel(
  db: GrowthDb,
  tokenFor: (connectionId: string) => Promise<string>,
  channelId: string,
  channelLabel: string,
  fetchImpl: FetchLike,
  log: (message: string) => void
): Promise<YoutubeVideoStat[] | null> {
  const destinations = destinationsForNetwork(db, "youtube").filter((row) => row.enabled);
  const ordered = [...destinations.filter((row) => row.externalId === channelId), ...destinations.filter((row) => row.externalId !== channelId)];
  const seen = new Set<string>();
  if (!ordered.length) {
    log(`views youtube skipped ${channelLabel}: no connection`);
    return null;
  }
  for (const destination of ordered) {
    if (seen.has(destination.connectionId)) continue;
    seen.add(destination.connectionId);
    try {
      const token = await tokenFor(destination.connectionId);
      if (!token) continue;
      return await fetchYoutubeUploadStats(token, channelId, fetchImpl);
    } catch (error) {
      log(`views youtube ${channelLabel} failed: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  return null;
}

function readDump(input: ViewStatsInput, now: Date, log: (message: string) => void): { views: number | null; channels: Record<string, number | null>; at: Date | null } | null {
  const file = input.youtubeDumpFile ?? path.join(defaultPaths().dataDir, "youtube_views_dump.json");
  if (!file || !existsSync(file)) return null;
  let raw: unknown;
  let mtime = now;
  try {
    mtime = statSync(file).mtime;
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    log("views youtube dump unreadable");
    return null;
  }
  const dump = parseYoutubeDump(raw);
  if (!dump.videos.length) {
    log("views youtube dump had no view counts");
    return null;
  }
  const at = dump.updatedAt ? new Date(dump.updatedAt) : mtime;
  const previous = Date.parse(getSetting(input.db, "views_youtube_at") ?? "");
  if (Number.isFinite(previous) && at.getTime() <= previous) return null;
  saveYoutubeVideos(input.db, dump.videos, at);
  setSetting(input.db, "views_youtube_at", at.toISOString());
  log(`views youtube dump videos=${dump.videos.length}`);
  return {
    views: countSum(input.db, "SELECT SUM(youtube_views) AS views, COUNT(youtube_views) AS n FROM view_videos"),
    channels: channelSums(input.db),
    at
  };
}

function channelSums(db: GrowthDb): Record<string, number | null> {
  const sums: Record<string, number | null> = {};
  for (const channel of VIEW_CHANNELS) {
    sums[channel.id] = countSum(db, "SELECT SUM(youtube_views) AS views, COUNT(youtube_views) AS n FROM view_videos WHERE channel_id = ?", [channel.id]);
  }
  return sums;
}

async function refreshTikTok(input: ViewStatsInput, now: Date, log: (message: string) => void): Promise<number | null> {
  if (recentlyTried(input.db, "views_tiktok_try_at", now, Boolean(input.force))) return null;
  const page = input.tiktokPage ?? (process.env.ZERNIO_API_KEY?.trim() ? liveTikTokPage : null);
  if (!page) return null;
  setSetting(input.db, "views_tiktok_try_at", now.toISOString());
  const toDate = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const posts = await collectTikTokPosts((index) => page(index, fromDate, toDate));
  const totals = applyTikTokViews(input.db, posts, now);
  setSetting(input.db, "views_tiktok_at", now.toISOString());
  log(`views tiktok posts=${posts.length}`);
  return totals.views;
}

function refreshTelegram(input: ViewStatsInput, now: Date, log: (message: string) => void): number | null {
  if (recentlyTried(input.db, "views_telegram_try_at", now, Boolean(input.force))) return null;
  const file = input.telegramFile ?? (process.env.TGRELAY_VIEWS_FILE?.trim() || "/app/apps/growth/tgrelay/views.json");
  setSetting(input.db, "views_telegram_try_at", now.toISOString());
  const loaded = loadTelegramViews(file);
  if (loaded.status !== "ok") {
    log(loaded.status === "invalid" ? "views telegram file is not json" : loaded.status === "unrecognized" ? "views telegram file had no posts or groups" : "views telegram file missing");
    return null;
  }
  const applied = applyTelegramViews(input.db, loaded.parsed, now);
  const at = loaded.updatedAt || now.toISOString();
  setSetting(input.db, "views_telegram_at", at);
  log(`views telegram posts=${loaded.parsed.posts.length} groups=${loaded.parsed.groups.length}`);
  return applied.views;
}

const liveFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status, json: () => response.json() as Promise<unknown> };
};

async function liveTikTokPage(page: number, fromDate: string, toDate: string): Promise<unknown> {
  const base = (process.env.ZERNIO_API_BASE?.trim() || "https://zernio.com/api/v1").replace(/\/$/, "");
  const key = process.env.ZERNIO_API_KEY?.trim() ?? "";
  if (!key) throw new Error("ZERNIO_API_KEY is not set");
  const query = new URLSearchParams({
    platform: "tiktok",
    fromDate,
    toDate,
    source: "late",
    limit: "50",
    page: String(page),
    sortBy: "date",
    order: "desc"
  });
  const response = await fetch(`${base}/analytics?${query.toString()}`, {
    method: "GET",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }
  });
  const data = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) throw new Error(`zernio ${response.status}`);
  return data;
}

function withTransaction(db: GrowthDb, work: () => void): void {
  db.exec("BEGIN");
  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The statement already failed. The original error is the one to surface.
    }
    throw error;
  }
}
