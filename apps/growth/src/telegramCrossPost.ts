import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { retryDelayMs, ZERNIO_MAX_ATTEMPTS, zernioMinGapMs, type ZernioCrossRow } from "./zernio.js";
import type { GrowthDb } from "./db.js";

export const TELEGRAM_CAPTION_LIMIT = 1024;
export const TELEGRAM_VIDEO_LIMIT = 50 * 1024 * 1024;
const SITE = "https://reelmino.com";

export type TelegramDelivery = "video" | "message";

export type TelegramCandidate = {
  jobId: string;
  publishAt: Date;
  kind: "short" | "longform";
};

export function parseTelegramChatIds(raw = process.env.TELEGRAM_CHAT_IDS): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && parseTelegramChatIds().length);
}

export function telegramSendMode(kind: "short" | "longform", sizeBytes: number | null): TelegramDelivery {
  if (kind === "longform") return "message";
  if (sizeBytes == null || sizeBytes > TELEGRAM_VIDEO_LIMIT) return "message";
  return "video";
}

export function telegramCrossCaption(input: {
  title: string;
  description?: string;
  youtubeUrl: string;
  language?: string;
  siteUrl?: string;
}): string {
  const hebrew = (input.language ?? "en").toLowerCase().startsWith("he");
  const title = input.title.replace(/\s+/g, " ").trim();
  const description = (input.description ?? "").replace(/\s+/g, " ").trim();
  const youtube = input.youtubeUrl.trim();
  const site = (input.siteUrl ?? SITE).trim();
  const tail = `${hebrew ? "יוטיוב" : "YouTube"}: ${youtube}\n${site}`;
  const head = [title, description].filter(Boolean).join("\n\n");
  const full = head ? `${head}\n\n${tail}` : tail;
  if (full.length <= TELEGRAM_CAPTION_LIMIT) return full;
  const room = TELEGRAM_CAPTION_LIMIT - tail.length - 2;
  const trimmed = head.slice(0, Math.max(0, room)).trimEnd();
  const next = trimmed ? `${trimmed}\n\n${tail}` : tail;
  return next.length <= TELEGRAM_CAPTION_LIMIT ? next : next.slice(0, TELEGRAM_CAPTION_LIMIT);
}

export function selectTelegramPost(input: {
  now: Date;
  minGapMs: number;
  lastPostedAt: Date | null;
  candidates: TelegramCandidate[];
}): TelegramCandidate | null {
  if (input.lastPostedAt && input.now.getTime() - input.lastPostedAt.getTime() < input.minGapMs) return null;
  const ready = input.candidates
    .filter((item) => item.publishAt.getTime() <= input.now.getTime())
    .sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime() || a.jobId.localeCompare(b.jobId));
  return ready[0] ?? null;
}

export function dueTelegramChats(chatIds: string[], rows: ZernioCrossRow[], now: Date): string[] {
  return chatIds.filter((chatId) => {
    const row = rows.find((item) => item.network === telegramNetwork(chatId));
    if (!row) return true;
    if (row.status === "posted" || row.status === "failed") return false;
    const nextAt = Date.parse(readDetail(row.detail).nextAt ?? "");
    return !Number.isFinite(nextAt) || nextAt <= now.getTime();
  });
}

export type TelegramClient = {
  sendVideo: (input: { chatId: string; filename: string; bytes: Uint8Array; caption: string }) => Promise<{ messageId: string }>;
  sendMessage: (input: { chatId: string; text: string }) => Promise<{ messageId: string }>;
};

type ReadyVideo = TelegramCandidate & {
  title: string;
  description: string;
  language: string;
  youtubeUrl: string;
  mediaPath: string | null;
};

export async function advanceTelegramCrossPosts(
  db: GrowthDb,
  input: { now: Date; mediaDir: string; log: (message: string) => void; client?: TelegramClient; chatIds?: string[] }
): Promise<void> {
  const chatIds = input.chatIds ?? parseTelegramChatIds();
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if ((!token && !input.client) || !chatIds.length) return;
  const client = input.client ?? liveTelegramClient(token);
  try {
    const videos = readyVideos(db);
    await retryStarted(db, videos, chatIds, input.now, input.mediaDir, client, input.log);
    const rows = telegramRows(db);
    const started = new Set(rows.map((row) => row.jobId));
    const chosen = selectTelegramPost({
      now: input.now,
      minGapMs: zernioMinGapMs(),
      lastPostedAt: latestPosted(rows),
      candidates: videos.filter((item) => !started.has(item.jobId))
    });
    const video = videos.find((item) => item.jobId === chosen?.jobId);
    if (!video) return;
    await sendVideoToChats(db, video, chatIds, input.now, input.mediaDir, client, input.log);
  } catch (error) {
    input.log(`telegram cross-post failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function retryStarted(
  db: GrowthDb,
  videos: ReadyVideo[],
  chatIds: string[],
  now: Date,
  mediaDir: string,
  client: TelegramClient,
  log: (message: string) => void
): Promise<void> {
  const byJob = new Map<string, ZernioCrossRow[]>();
  for (const row of telegramRows(db)) {
    const list = byJob.get(row.jobId) ?? [];
    list.push(row);
    byJob.set(row.jobId, list);
  }
  for (const [jobId, jobRows] of byJob) {
    const pending = dueTelegramChats(chatIds, jobRows, now);
    if (!pending.length) continue;
    if (pending.length === chatIds.length && jobRows.every((row) => row.status !== "retry")) continue;
    const video = videos.find((item) => item.jobId === jobId);
    if (!video || video.publishAt.getTime() > now.getTime()) continue;
    await sendVideoToChats(db, video, pending, now, mediaDir, client, log);
  }
}

async function sendVideoToChats(
  db: GrowthDb,
  video: ReadyVideo,
  chatIds: string[],
  now: Date,
  mediaDir: string,
  client: TelegramClient,
  log: (message: string) => void
): Promise<void> {
  if (video.publishAt.getTime() > now.getTime()) return;
  const caption = telegramCrossCaption({
    title: video.title,
    description: video.description,
    youtubeUrl: video.youtubeUrl,
    language: video.language
  });
  let size: number | null = null;
  let bytes: Uint8Array | null = null;
  if (video.kind === "short" && video.mediaPath) {
    try {
      const filePath = path.join(mediaDir, video.mediaPath);
      size = (await stat(filePath)).size;
      if (telegramSendMode(video.kind, size) === "video") bytes = await readFile(filePath);
    } catch (error) {
      log(`telegram ${video.jobId} media unreadable: ${error instanceof Error ? error.message : String(error)}`);
      size = null;
    }
  }
  const mode = telegramSendMode(video.kind, size);
  for (const chatId of chatIds) {
    const existing = db.prepare("SELECT status FROM growth_crossposts WHERE job_id = ? AND network = ?").get(video.jobId, telegramNetwork(chatId)) as { status?: string } | undefined;
    if (existing?.status === "posted") continue;
    try {
      const result = mode === "video" && bytes
        ? await client.sendVideo({ chatId, filename: video.mediaPath || "short.mp4", bytes, caption })
        : await client.sendMessage({ chatId, text: caption });
      writeRow(db, video.jobId, chatId, "posted", result.messageId || "posted", now);
      log(`telegram ${chatId} posted ${video.jobId} ${result.messageId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = rememberFailure(db, video.jobId, chatId, message, now);
      log(`telegram ${chatId} ${status} for ${video.jobId}: ${message}`);
    }
  }
}

function rememberFailure(db: GrowthDb, jobId: string, chatId: string, message: string, now: Date): string {
  const current = db.prepare("SELECT detail FROM growth_crossposts WHERE job_id = ? AND network = ?").get(jobId, telegramNetwork(chatId)) as { detail?: string } | undefined;
  const attempts = (readDetail(current?.detail ?? "").attempts ?? 0) + 1;
  const status = attempts >= ZERNIO_MAX_ATTEMPTS ? "failed" : "retry";
  writeRow(db, jobId, chatId, status, JSON.stringify({
    attempts,
    nextAt: new Date(now.getTime() + retryDelayMs(attempts)).toISOString(),
    error: message.slice(0, 300)
  }), now);
  return status;
}

function writeRow(db: GrowthDb, jobId: string, chatId: string, status: string, detail: string, now: Date): void {
  db.prepare("INSERT OR REPLACE INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, ?, ?, ?, ?)").run(
    jobId,
    telegramNetwork(chatId),
    status,
    detail,
    now.toISOString()
  );
}

function telegramNetwork(chatId: string): string {
  return `telegram:${chatId}`;
}

function readyVideos(db: GrowthDb): ReadyVideo[] {
  const rows = db.prepare(
    `SELECT jobs.id AS job_id, jobs.remote_url AS remote_url, jobs.remote_post_id AS remote_post_id,
            items.title AS title, items.language AS language, items.copy_json AS copy_json, items.media_path AS media_path, items.source AS source,
            slots.publish_at AS publish_at, destinations.external_id AS external_id, destinations.handle AS handle
     FROM shorts_slots slots
     JOIN jobs ON jobs.id = slots.job_id
     JOIN items ON items.id = jobs.item_id
     JOIN destinations ON destinations.id = slots.destination_id
     WHERE slots.status = 'published' AND jobs.status = 'published' AND items.source IN ('shorts-schedule', 'longform')`
  ).all() as Array<Record<string, unknown>>;
  const videos: ReadyVideo[] = [];
  for (const row of rows) {
    const publishAt = new Date(String(row.publish_at ?? ""));
    if (Number.isNaN(publishAt.getTime()) || !row.job_id) continue;
    const source = String(row.source ?? "");
    const copy = parseCopy(String(row.copy_json ?? ""));
    const mediaPath = String(row.media_path ?? "");
    videos.push({
      jobId: String(row.job_id),
      publishAt,
      kind: source === "longform" ? "longform" : "short",
      title: String(row.title ?? ""),
      description: copy.description,
      language: String(row.language ?? "en"),
      youtubeUrl: youtubeUrl(String(row.remote_url ?? ""), String(row.remote_post_id ?? ""), String(row.external_id ?? ""), String(row.handle ?? "")),
      mediaPath: mediaPath && !mediaPath.startsWith("https://") ? mediaPath : null
    });
  }
  return videos;
}

function youtubeUrl(remoteUrl: string, remotePostId: string, externalId: string, handle: string): string {
  if (remoteUrl.startsWith("https://")) return remoteUrl;
  if (remotePostId) return `https://www.youtube.com/watch?v=${remotePostId}`;
  if (externalId === "UC3iee8PYICmnfO5s8viJgkQ" || /reelminoapp/i.test(handle)) return "https://www.youtube.com/channel/UC3iee8PYICmnfO5s8viJgkQ";
  return `https://www.youtube.com/channel/${externalId || "UCsKPN8oZJOPM4KJC4bN_ANw"}`;
}

function parseCopy(raw: string): { description: string } {
  try {
    const copy = JSON.parse(raw) as { youtube?: { body?: string }; article?: { description?: string } };
    return { description: (copy.youtube?.body || copy.article?.description || "").trim() };
  } catch {
    return { description: "" };
  }
}

function telegramRows(db: GrowthDb): ZernioCrossRow[] {
  const rows = db.prepare("SELECT job_id, network, status, detail, created_at FROM growth_crossposts WHERE network LIKE 'telegram:%'").all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    jobId: String(row.job_id ?? ""),
    network: String(row.network ?? ""),
    status: String(row.status ?? ""),
    detail: String(row.detail ?? ""),
    createdAt: String(row.created_at ?? "")
  }));
}

function latestPosted(rows: ZernioCrossRow[]): Date | null {
  const stamps = rows.filter((row) => row.status === "posted").map((row) => Date.parse(row.createdAt)).filter((stamp) => Number.isFinite(stamp));
  if (!stamps.length) return null;
  return new Date(Math.max(...stamps));
}

function readDetail(detail: string): { attempts?: number; nextAt?: string } {
  if (!detail.startsWith("{")) return {};
  try {
    return JSON.parse(detail) as { attempts?: number; nextAt?: string };
  } catch {
    return {};
  }
}

function liveTelegramClient(token: string): TelegramClient {
  const base = `https://api.telegram.org/bot${token}`;
  return {
    async sendVideo(input) {
      const form = new FormData();
      form.append("chat_id", input.chatId);
      form.append("caption", input.caption);
      form.append("supports_streaming", "true");
      const file = new Uint8Array(input.bytes.byteLength);
      file.set(input.bytes);
      form.append("video", new Blob([file.buffer as ArrayBuffer], { type: "video/mp4" }), input.filename);
      return telegramResult(await fetch(`${base}/sendVideo`, { method: "POST", body: form }));
    },
    async sendMessage(input) {
      return telegramResult(await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: input.chatId, text: input.text })
      }));
    }
  };
}

async function telegramResult(response: Response): Promise<{ messageId: string }> {
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } };
  if (!response.ok || data.ok === false || data.result?.message_id == null) {
    throw new Error(data.description || `telegram ${response.status}`);
  }
  return { messageId: String(data.result.message_id) };
}
