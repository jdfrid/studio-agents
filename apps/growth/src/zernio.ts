import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSetting, setSetting, type GrowthDb } from "./db.js";
import { localDay, scheduleFor, scheduledChannel } from "./shortsSchedule.js";

export const DEFAULT_ZERNIO_ACCOUNTS = "tiktok:6afd5d11e23b7dac9dfd7e84,x:6afd5d2a030baa4c27c55943";
export const ZERNIO_MAX_ATTEMPTS = 5;

const PLATFORM_NAMES: Record<string, string> = {
  x: "twitter",
  twitter: "twitter",
  tiktok: "tiktok",
  instagram: "instagram",
  facebook: "facebook",
  telegram: "telegram"
};

const TAG_STOP = new Set(["the", "and", "for", "with", "your", "this", "that", "from", "how", "keep", "what", "when", "into", "over", "under", "shorts", "video"]);

export type ZernioAccount = { platform: string; accountId: string };

export type ZernioCandidate = {
  jobId: string;
  kind: "kitchen" | "product";
  slotIndex: number;
  publishAt: Date;
};

export type ZernioCrossRow = {
  jobId: string;
  network: string;
  status: string;
  detail: string;
  createdAt: string;
};

export function zernioApiKey(): string {
  return process.env.ZERNIO_API_KEY?.trim() ?? "";
}

export function parseZernioAccounts(raw = process.env.ZERNIO_ACCOUNTS): ZernioAccount[] {
  const source = raw?.trim() ? raw : DEFAULT_ZERNIO_ACCOUNTS;
  const seen = new Set<string>();
  const accounts: ZernioAccount[] = [];
  for (const part of source.split(",")) {
    const [name, accountId] = part.split(":").map((item) => item.trim());
    const platform = PLATFORM_NAMES[(name ?? "").toLowerCase()];
    if (!platform || !accountId || seen.has(platform)) continue;
    seen.add(platform);
    accounts.push({ platform, accountId });
  }
  return accounts;
}

export function zernioDailyCap(): number {
  const parsed = Number(process.env.ZERNIO_DAILY_CAP?.trim());
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 20) return parsed;
  return 3;
}

export function zernioMinGapMs(): number {
  const parsed = Number(process.env.ZERNIO_MIN_GAP_HOURS?.trim());
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 48) return parsed * 60 * 60 * 1000;
  return 2 * 60 * 60 * 1000;
}

export function preferredKind(slotIndex: number, spec = process.env.ZERNIO_SLOT_PREFER): "kitchen" | "product" {
  const parity = slotIndex % 2 === 0 ? "even" : "odd";
  const raw = (spec?.trim() || "even:kitchen,odd:product").split(",");
  const match = raw.map((part) => part.trim().toLowerCase()).find((part) => part.startsWith(`${parity}:`));
  return match?.endsWith(":product") ? "product" : "kitchen";
}

export function slotIndexFromKey(slotKey: string, clocks: string[]): number {
  const parts = slotKey.split(":");
  const hhmm = parts.length >= 2 ? `${parts[parts.length - 2]}:${parts[parts.length - 1]}` : "";
  const index = clocks.indexOf(hhmm);
  return index >= 0 ? index : 0;
}

export function pickHashtags(title: string, tags: string[] = []): string[] {
  const cleaned = tags.map((tag) => tag.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "")).filter((tag) => tag.length >= 3);
  const words = title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length >= 4 && !TAG_STOP.has(word));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...cleaned, ...words, "tips", "youtube"]) {
    const key = tag.toLowerCase();
    if (seen.has(key) || key === "shorts") continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}

export function zernioCaption(input: { title: string; hashtags?: string[]; channelUrl: string; maxLength?: number }): string {
  const title = input.title.replace(/\s+/g, " ").trim();
  const tail = `More on YouTube: ${input.channelUrl.trim()}`;
  let tags = pickHashtags(title, input.hashtags ?? []);
  const textOf = (heading: string, chosen: string[]) => `${heading}\n${chosen.map((tag) => `#${tag}`).join(" ")}\n${tail}`;
  let text = textOf(title, tags);
  const limit = input.maxLength;
  if (!limit || text.length <= limit) return text;
  while (tags.length > 2 && text.length > limit) {
    tags = tags.slice(0, -1);
    text = textOf(title, tags);
  }
  if (text.length <= limit) return text;
  const suffix = `\n${tags.map((tag) => `#${tag}`).join(" ")}\n${tail}`;
  const heading = title.slice(0, Math.max(0, limit - suffix.length)).trimEnd();
  return `${heading}${suffix}`;
}

export function crossPostCaption(title: string, channelUrl: string, hashtags: string[] = []): string {
  return zernioCaption({ title, channelUrl, hashtags });
}

export function retryDelayMs(attempt: number): number {
  const steps = Math.max(0, attempt - 1);
  return Math.min(2 * 60 * 60 * 1000, 2 * 60 * 1000 * 4 ** steps);
}

export function zernioIdempotencyKey(jobId: string, platform: string): string {
  const hex = createHash("sha256").update(`zernio:${jobId}:${platform}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function zernioPostBody(input: { content: string; mediaUrl: string; platform: string; accountId: string }): Record<string, unknown> {
  const body: Record<string, unknown> = {
    content: input.content,
    mediaItems: [{ type: "video", url: input.mediaUrl }],
    platforms: [{ platform: input.platform, accountId: input.accountId }],
    publishNow: true
  };
  if (input.platform === "tiktok") {
    body.tiktokSettings = {
      privacy_level: "PUBLIC_TO_EVERYONE",
      allow_comment: true,
      allow_duet: true,
      allow_stitch: true,
      content_preview_confirmed: true,
      express_consent_given: true
    };
  }
  return body;
}

export function selectZernioShort(input: {
  now: Date;
  cap: number;
  minGapMs: number;
  postedToday: number;
  lastPostedAt: Date | null;
  candidates: ZernioCandidate[];
  prefer?: (slotIndex: number) => "kitchen" | "product";
}): ZernioCandidate | null {
  if (input.postedToday >= input.cap) return null;
  if (input.lastPostedAt && input.now.getTime() - input.lastPostedAt.getTime() < input.minGapMs) return null;
  const prefer = input.prefer ?? ((slotIndex: number) => preferredKind(slotIndex));
  const ready = input.candidates.filter((item) => item.publishAt.getTime() <= input.now.getTime()).sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime());
  const matches = (item: ZernioCandidate) => item.kind === prefer(item.slotIndex);
  const preferred = ready.filter(matches);
  if (preferred.length) return preferred[0] ?? null;
  const upcoming = input.candidates.some((item) => item.publishAt.getTime() > input.now.getTime() && matches(item));
  if (upcoming) return null;
  return ready[0] ?? null;
}

export function duePlatforms(accounts: ZernioAccount[], rows: ZernioCrossRow[], now: Date): ZernioAccount[] {
  return accounts.filter((account) => {
    const row = rows.find((item) => item.network === `zernio:${account.platform}`);
    if (!row) return true;
    if (row.status === "posted" || row.status === "failed") return false;
    const nextAt = Date.parse(readDetail(row.detail).nextAt ?? "");
    return !Number.isFinite(nextAt) || nextAt <= now.getTime();
  });
}

export function countPostedOnDay(rows: ZernioCrossRow[], now: Date, timeZone: string): number {
  const day = localDay(now, timeZone);
  const ids = new Set(rows.filter((row) => row.status === "posted" && localDay(new Date(row.createdAt), timeZone) === day).map((row) => row.jobId));
  return ids.size;
}

export function latestPostedAt(rows: ZernioCrossRow[]): Date | null {
  const stamps = rows.filter((row) => row.status === "posted").map((row) => Date.parse(row.createdAt)).filter((stamp) => Number.isFinite(stamp));
  if (!stamps.length) return null;
  return new Date(Math.max(...stamps));
}

export function summarizeZernioAnalytics(payload: unknown): string {
  const posts = (payload as { posts?: Array<{ platform?: string; analytics?: { views?: number; likes?: number } }> })?.posts ?? [];
  const totals = new Map<string, { views: number; likes: number; posts: number }>();
  for (const post of posts) {
    const platform = post.platform || "unknown";
    const current = totals.get(platform) ?? { views: 0, likes: 0, posts: 0 };
    current.views += Number(post.analytics?.views ?? 0);
    current.likes += Number(post.analytics?.likes ?? 0);
    current.posts += 1;
    totals.set(platform, current);
  }
  if (!totals.size) return "none";
  return [...totals.entries()].map(([platform, row]) => `${platform} posts=${row.posts} views=${row.views} likes=${row.likes}`).join("; ");
}

type Detail = { postId?: string; attempts?: number; nextAt?: string; error?: string };

function readDetail(detail: string): Detail {
  if (!detail.startsWith("{")) return { postId: detail };
  try {
    return JSON.parse(detail) as Detail;
  } catch {
    return { error: detail };
  }
}

export type ZernioClient = {
  upload: (file: Uint8Array, filename: string) => Promise<string>;
  publish: (input: { jobId: string; platform: string; accountId: string; content: string; mediaUrl: string }) => Promise<{ postId: string }>;
  analytics?: (fromDate: string, toDate: string) => Promise<unknown>;
};

type ReadyShort = ZernioCandidate & {
  title: string;
  hashtags: string[];
  channelUrl: string;
  mediaPath: string | null;
  mediaUrl: string | null;
};

export async function advanceZernioCrossPosts(
  db: GrowthDb,
  input: { now: Date; mediaDir: string; log: (message: string) => void; client?: ZernioClient; timeZone?: string }
): Promise<void> {
  const client = input.client ?? (zernioApiKey() ? liveZernioClient() : null);
  if (!client) return;
  const accounts = parseZernioAccounts();
  if (!accounts.length) {
    input.log("zernio skipped: ZERNIO_ACCOUNTS is empty");
    return;
  }
  try {
    const shorts = readyShorts(db);
    const rows = crossRows(db);
    await retryStarted(db, shorts, rows, accounts, input.now, input.mediaDir, client, input.log);
    const freshRows = crossRows(db);
    const started = new Set(freshRows.map((row) => row.jobId));
    const chosen = selectZernioShort({
      now: input.now,
      cap: zernioDailyCap(),
      minGapMs: zernioMinGapMs(),
      postedToday: countPostedOnDay(freshRows, input.now, input.timeZone ?? scheduleZone()),
      lastPostedAt: latestPostedAt(freshRows),
      candidates: shorts.filter((item) => !started.has(item.jobId))
    });
    if (!chosen) return;
    const short = shorts.find((item) => item.jobId === chosen.jobId);
    if (!short) return;
    await sendShort(db, short, accounts, input.now, input.mediaDir, client, input.log);
  } catch (error) {
    input.log(`zernio cross-post failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function logZernioAnalytics(db: GrowthDb, now: Date, log: (message: string) => void, client?: ZernioClient): Promise<void> {
  const live = client ?? (zernioApiKey() ? liveZernioClient() : null);
  if (!live?.analytics) return;
  const last = Date.parse(getSetting(db, "zernio_analytics_at") ?? "");
  if (Number.isFinite(last) && now.getTime() - last < 7 * 24 * 60 * 60 * 1000) return;
  const toDate = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const payload = await live.analytics(fromDate, toDate);
    log(`zernio analytics ${summarizeZernioAnalytics(payload)}`);
  } catch (error) {
    log(`zernio analytics unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  setSetting(db, "zernio_analytics_at", now.toISOString());
}

async function retryStarted(
  db: GrowthDb,
  shorts: ReadyShort[],
  rows: ZernioCrossRow[],
  accounts: ZernioAccount[],
  now: Date,
  mediaDir: string,
  client: ZernioClient,
  log: (message: string) => void
): Promise<void> {
  const byJob = new Map<string, ZernioCrossRow[]>();
  for (const row of rows) {
    const list = byJob.get(row.jobId) ?? [];
    list.push(row);
    byJob.set(row.jobId, list);
  }
  for (const [jobId, jobRows] of byJob) {
    const pending = duePlatforms(accounts, jobRows, now);
    if (!pending.length || pending.length === accounts.length && jobRows.every((row) => row.status !== "retry")) continue;
    const short = shorts.find((item) => item.jobId === jobId);
    if (!short) continue;
    await sendShort(db, short, pending, now, mediaDir, client, log);
  }
}

async function sendShort(
  db: GrowthDb,
  short: ReadyShort,
  accounts: ZernioAccount[],
  now: Date,
  mediaDir: string,
  client: ZernioClient,
  log: (message: string) => void
): Promise<void> {
  if (short.publishAt.getTime() > now.getTime()) return;
  let mediaUrl = short.mediaUrl;
  if (!mediaUrl) {
    if (!short.mediaPath) {
      for (const account of accounts) rememberFailure(db, short.jobId, account.platform, "rendered mp4 is missing", now);
      log(`zernio ${short.jobId} waiting for the rendered mp4`);
      return;
    }
    try {
      const bytes = await readFile(path.join(mediaDir, short.mediaPath));
      mediaUrl = await client.upload(bytes, short.mediaPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const account of accounts) rememberFailure(db, short.jobId, account.platform, message, now);
      log(`zernio upload failed for ${short.jobId}: ${message}`);
      return;
    }
  }
  for (const account of accounts) {
    const existing = db.prepare("SELECT status FROM growth_crossposts WHERE job_id = ? AND network = ?").get(short.jobId, `zernio:${account.platform}`) as { status?: string } | undefined;
    if (existing?.status === "posted") continue;
    const limit = account.platform === "twitter" ? 280 : undefined;
    const content = zernioCaption({ title: short.title, hashtags: short.hashtags, channelUrl: short.channelUrl, maxLength: limit });
    try {
      const result = await client.publish({ jobId: short.jobId, platform: account.platform, accountId: account.accountId, content, mediaUrl });
      writeRow(db, short.jobId, account.platform, "posted", result.postId || "posted", now);
      log(`zernio ${account.platform} posted ${short.jobId} ${result.postId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = rememberFailure(db, short.jobId, account.platform, message, now);
      log(`zernio ${account.platform} ${status} for ${short.jobId}: ${message}`);
    }
  }
}

function rememberFailure(db: GrowthDb, jobId: string, platform: string, message: string, now: Date): string {
  const network = `zernio:${platform}`;
  const current = db.prepare("SELECT detail FROM growth_crossposts WHERE job_id = ? AND network = ?").get(jobId, network) as { detail?: string } | undefined;
  const attempts = (readDetail(current?.detail ?? "").attempts ?? 0) + 1;
  const status = attempts >= ZERNIO_MAX_ATTEMPTS ? "failed" : "retry";
  const detail = JSON.stringify({
    attempts,
    nextAt: new Date(now.getTime() + retryDelayMs(attempts)).toISOString(),
    error: message.slice(0, 300)
  });
  writeRow(db, jobId, platform, status, detail, now);
  return status;
}

function writeRow(db: GrowthDb, jobId: string, platform: string, status: string, detail: string, now: Date): void {
  db.prepare("INSERT OR REPLACE INTO growth_crossposts (job_id, network, status, detail, created_at) VALUES (?, ?, ?, ?, ?)").run(
    jobId,
    `zernio:${platform}`,
    status,
    detail,
    now.toISOString()
  );
}

function readyShorts(db: GrowthDb): ReadyShort[] {
  const rows = db.prepare(
    `SELECT jobs.id AS job_id, items.title AS title, items.copy_json AS copy_json, items.media_path AS media_path,
            slots.publish_at AS publish_at, slots.slot_key AS slot_key, destinations.external_id AS external_id,
            destinations.handle AS handle, destinations.name AS name, destinations.url AS url
     FROM shorts_slots slots
     JOIN jobs ON jobs.id = slots.job_id
     JOIN items ON items.id = jobs.item_id
     JOIN destinations ON destinations.id = slots.destination_id
     WHERE slots.status = 'published' AND jobs.status = 'published' AND items.source = 'shorts-schedule'`
  ).all() as Array<Record<string, unknown>>;
  const shorts: ReadyShort[] = [];
  for (const row of rows) {
    const destination = {
      externalId: String(row.external_id ?? ""),
      handle: String(row.handle ?? ""),
      name: String(row.name ?? ""),
      url: String(row.url ?? "")
    };
    const kind = scheduledChannel(destination);
    if (!kind) continue;
    const publishAt = new Date(String(row.publish_at ?? ""));
    if (Number.isNaN(publishAt.getTime())) continue;
    const copy = parseCopy(String(row.copy_json ?? ""));
    const mediaPath = String(row.media_path ?? "");
    shorts.push({
      jobId: String(row.job_id ?? ""),
      kind,
      slotIndex: slotIndexFromKey(String(row.slot_key ?? ""), scheduleFor(kind)),
      publishAt,
      title: String(row.title ?? ""),
      hashtags: copy,
      channelUrl: channelUrl(destination),
      mediaPath: mediaPath && !mediaPath.startsWith("https://") ? mediaPath : null,
      mediaUrl: mediaPath.startsWith("https://") ? mediaPath : null
    });
  }
  return shorts.filter((item) => item.jobId);
}

function channelUrl(destination: { externalId: string; handle: string }): string {
  if (destination.externalId === "UC3iee8PYICmnfO5s8viJgkQ" || /reelminoapp/i.test(destination.handle)) {
    return "https://www.youtube.com/channel/UC3iee8PYICmnfO5s8viJgkQ";
  }
  return `https://www.youtube.com/channel/${destination.externalId || "UCsKPN8oZJOPM4KJC4bN_ANw"}`;
}

function parseCopy(raw: string): string[] {
  try {
    const copy = JSON.parse(raw) as { hashtags?: string[] };
    return Array.isArray(copy.hashtags) ? copy.hashtags : [];
  } catch {
    return [];
  }
}

function crossRows(db: GrowthDb): ZernioCrossRow[] {
  const rows = db.prepare("SELECT job_id, network, status, detail, created_at FROM growth_crossposts WHERE network LIKE 'zernio:%'").all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    jobId: String(row.job_id ?? ""),
    network: String(row.network ?? ""),
    status: String(row.status ?? ""),
    detail: String(row.detail ?? ""),
    createdAt: String(row.created_at ?? "")
  }));
}

function scheduleZone(): string {
  const zone = process.env.SHORTS_TIMEZONE?.trim();
  if (!zone) return "Asia/Jerusalem";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return "Asia/Jerusalem";
  }
}

function liveZernioClient(): ZernioClient {
  const base = (process.env.ZERNIO_API_BASE?.trim() || "https://zernio.com/api/v1").replace(/\/$/, "");
  return {
    async upload(file, filename) {
      const presign = await zernioJson(base, "/media/presign", {
        method: "POST",
        body: JSON.stringify({ filename, contentType: "video/mp4", size: file.byteLength })
      });
      const uploadUrl = String(presign.uploadUrl ?? "");
      const publicUrl = String(presign.publicUrl ?? "");
      if (!uploadUrl || !publicUrl) throw new Error("zernio presign returned no upload URL");
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "video/mp4" }, body: file });
      if (!put.ok) throw new Error(`zernio media upload ${put.status}`);
      return publicUrl;
    },
    async publish(input) {
      const data = await zernioJson(base, "/posts", {
        method: "POST",
        headers: { "Idempotency-Key": zernioIdempotencyKey(input.jobId, input.platform) },
        body: JSON.stringify(zernioPostBody(input))
      });
      return { postId: postIdOf(data) };
    },
    async analytics(fromDate, toDate) {
      const query = new URLSearchParams({ fromDate, toDate, source: "late", limit: "20", sortBy: "views", order: "desc" });
      return zernioJson(base, `/analytics?${query.toString()}`, { method: "GET" });
    }
  };
}

async function zernioJson(base: string, pathName: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<Record<string, unknown>> {
  const key = zernioApiKey();
  if (!key) throw new Error("ZERNIO_API_KEY is not set");
  const response = await fetch(`${base}${pathName}`, {
    method: init.method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.body
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 409) return data;
  if (!response.ok) throw new Error(`zernio ${response.status}`);
  return data;
}

function postIdOf(data: Record<string, unknown>): string {
  const post = (data.post ?? data) as Record<string, unknown>;
  const id = post._id ?? post.id ?? data._id ?? data.id;
  return typeof id === "string" && id ? id : "posted";
}
