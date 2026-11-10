import type { PackageCopyInput } from "@studio/shared";
import { captionFromHandle } from "./angles.js";
import { applyVideoProfile, channelKind } from "./channelProfile.js";
import {
  destinationsForNetwork,
  getDestination,
  getItem,
  getSetting,
  itemDelivered,
  listJobs,
  setSetting,
  type Destination,
  type GrowthDb,
  type Item
} from "./db.js";

export const TELEGRAM_MIRROR_DESTINATION = "telegram_mirror_destination";
export const TELEGRAM_COPY_DESTINATIONS = "telegram_copy_destinations";
const TELEGRAM_MIRROR_QUEUE = "telegram_mirror_queue";
const MIRROR_ATTEMPTS = 3;
const CAPTION_LIMIT = 1024;

type MirrorTask = { itemId: string; destinationId: string };
export type CopyTopic = "brand" | "kitchen";

const SKIPPED_COPY_HANDLES = new Set(["dishes"]);

export function normalizeTelegramChat(hint: string): string {
  const trimmed = hint.trim();
  const named = trimmed.match(/^https?:\/\/t\.me\/([A-Za-z0-9_]{4,})\/?(?:[?#].*)?$/);
  if (named?.[1] && named[1] !== "c" && named[1] !== "joinchat") return `@${named[1]}`;
  return trimmed;
}

export function isTelegramInvite(hint: string): boolean {
  return /(?:^|\/)\+[A-Za-z0-9_-]{8,}/.test(hint.trim()) || /t\.me\/joinchat\//.test(hint.trim());
}

/** A public channel or group is @name or https://t.me/name. Invite links stay out of the copy form. */
export function publicTelegramAddress(hint: string): string | null {
  if (isTelegramInvite(hint)) return null;
  const normalized = normalizeTelegramChat(hint);
  return /^@[A-Za-z0-9_]{4,}$/.test(normalized) ? normalized : null;
}

/** @name, or the private chat id behind a https://t.me/c/123/456 link. */
export function telegramCopyAddress(hint: string): string | null {
  const named = publicTelegramAddress(hint);
  if (named) return named;
  const trimmed = hint.trim();
  const priv = trimmed.match(/(?:^|\/)c\/(\d+)(?:\/\d+)?\/?(?:[?#].*)?$/);
  if (priv?.[1]) return `-100${priv[1]}`;
  return /^-100\d{5,}$/.test(trimmed) ? trimmed : null;
}

export function skippedTelegramCopy(address: string): boolean {
  return SKIPPED_COPY_HANDLES.has(address.replace(/^@/, "").toLowerCase());
}

export function copyTopic(value: string): CopyTopic | null {
  return value === "brand" || value === "kitchen" ? value : null;
}

/** A channel needs an admin who can post. A group needs a member who is allowed to send. */
export function telegramCanPost(
  kind: string,
  member: { status?: string; can_post_messages?: boolean; can_send_messages?: boolean }
): boolean {
  const status = member.status ?? "";
  if (kind === "channel") return status === "creator" || (status === "administrator" && member.can_post_messages !== false);
  if (kind === "group" || kind === "supergroup") {
    if (status === "left" || status === "kicked") return false;
    if (status === "restricted") return member.can_send_messages !== false;
    return status === "creator" || status === "administrator" || status === "member";
  }
  return false;
}

/** The text under the Telegram video: the YouTube title, the description, then the public link. */
export function telegramCaption(title: string, description: string, link?: string): string {
  const head = title.trim();
  const body = description.trim();
  const url = (link ?? "").trim();
  let full = !head ? body : !body || body.startsWith(head) ? body || head : `${head}\n\n${body}`;
  if (url && !full.includes(url)) {
    const room = CAPTION_LIMIT - url.length - 2;
    if (full.length > room) full = `${full.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
    full = full ? `${full}\n\n${url}` : url;
  }
  if (full.length <= CAPTION_LIMIT) return full;
  return `${full.slice(0, CAPTION_LIMIT - 1).trimEnd()}…`;
}

function readQueue(db: GrowthDb): MirrorTask[] {
  const raw = getSetting(db, TELEGRAM_MIRROR_QUEUE);
  if (!raw) return [];
  const home = getSetting(db, TELEGRAM_MIRROR_DESTINATION)?.trim() || "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const tasks: MirrorTask[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item && home) tasks.push({ itemId: item, destinationId: home });
      else if (item && typeof item === "object" && typeof (item as MirrorTask).itemId === "string" && typeof (item as MirrorTask).destinationId === "string") {
        const task = item as MirrorTask;
        if (task.itemId && task.destinationId) tasks.push(task);
      }
    }
    return tasks;
  } catch {
    return [];
  }
}

function writeQueue(db: GrowthDb, tasks: MirrorTask[]): void {
  setSetting(db, TELEGRAM_MIRROR_QUEUE, JSON.stringify(tasks));
}

function enqueueTask(db: GrowthDb, task: MirrorTask): void {
  if (!task.itemId || !task.destinationId) return;
  if (itemDelivered(db, task.itemId, task.destinationId)) return;
  const queue = readQueue(db);
  if (queue.some((row) => row.itemId === task.itemId && row.destinationId === task.destinationId)) return;
  writeQueue(db, [...queue, task]);
}

export function telegramMirrorDestination(db: GrowthDb): Destination | null {
  const chosen = getSetting(db, TELEGRAM_MIRROR_DESTINATION)?.trim();
  if (chosen) {
    const row = getDestination(db, chosen);
    if (row?.network === "telegram" && row.enabled && row.kind !== "bot_chat") return row;
  }
  const channels = destinationsForNetwork(db, "telegram").filter((row) => row.enabled && row.kind !== "bot_chat" && row.kind !== "playlist");
  return channels.length === 1 ? channels[0]! : null;
}

export function telegramCopyIds(db: GrowthDb): string[] {
  const raw = getSetting(db, TELEGRAM_COPY_DESTINATIONS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
}

export function rememberTelegramMirror(db: GrowthDb, externalId: string): void {
  const row = destinationsForNetwork(db, "telegram").find((item) => item.externalId === externalId && item.kind !== "bot_chat");
  if (!row) return;
  if (getSetting(db, TELEGRAM_MIRROR_DESTINATION)?.trim()) return;
  setSetting(db, TELEGRAM_MIRROR_DESTINATION, row.id);
}

export function rememberTelegramCopy(db: GrowthDb, externalId: string): void {
  const row = destinationsForNetwork(db, "telegram").find((item) => item.externalId === externalId && item.kind !== "bot_chat");
  const home = getSetting(db, TELEGRAM_MIRROR_DESTINATION)?.trim();
  if (!row || !home || row.id === home) return;
  const ids = telegramCopyIds(db);
  if (ids.includes(row.id)) return;
  setSetting(db, TELEGRAM_COPY_DESTINATIONS, JSON.stringify([...ids, row.id]));
}

export function forgetTelegramCopy(db: GrowthDb, destinationId: string): void {
  setSetting(db, TELEGRAM_COPY_DESTINATIONS, JSON.stringify(telegramCopyIds(db).filter((id) => id !== destinationId)));
}

export function enqueueTelegramMirror(db: GrowthDb, itemId: string): void {
  const destination = telegramMirrorDestination(db);
  if (!itemId || !destination) return;
  enqueueTask(db, { itemId, destinationId: destination.id });
}

/** Queue a video once YouTube has accepted the upload. A later poll must not queue it again. */
export function queueYouTubeMirror(db: GrowthDb, previousStatus: string | undefined, nextStatus: string, itemId: string): void {
  if (nextStatus !== "published" && nextStatus !== "processing") return;
  if (previousStatus === "published" || previousStatus === "processing") return;
  enqueueTelegramMirror(db, itemId);
}

function youtubeJob(db: GrowthDb, itemId: string) {
  return listJobs(db).find(
    (row) => row.itemId === itemId && row.network === "youtube" && (row.status === "published" || row.status === "processing")
  );
}

function youtubeText(db: GrowthDb, item: Item): { title: string; description: string; link: string } {
  const job = youtubeJob(db, item.id);
  const link = job?.remoteUrl?.trim() || "";
  const snippet = job?.handle.snippet as { title?: unknown; description?: unknown } | undefined;
  if (typeof snippet?.title === "string" || typeof snippet?.description === "string") {
    return {
      title: typeof snippet?.title === "string" ? snippet.title : "",
      description: typeof snippet?.description === "string" ? snippet.description : "",
      link
    };
  }
  const locked = job ? captionFromHandle(job.handle) : null;
  const title = locked?.title || item.copy.youtube?.title || item.title;
  const description = locked?.body || item.copy.youtube?.body || item.summary;
  const destination = job?.destinationId ? getDestination(db, job.destinationId) : null;
  if (destination?.network === "youtube") {
    const profiled = applyVideoProfile({ title, body: description, hashtags: [], language: item.language }, destination);
    return { title: profiled.title ?? title, description: profiled.body ?? description, link };
  }
  return { title, description, link };
}

export function telegramCopyForItem(db: GrowthDb, item: Item): PackageCopyInput {
  const text = youtubeText(db, item);
  return {
    title: text.title,
    body: telegramCaption(text.title, text.description, text.link),
    hashtags: [],
    language: item.language
  };
}

function failedMirrors(db: GrowthDb, itemId: string, destinationId: string): number {
  return listJobs(db).filter((row) => row.itemId === itemId && row.destinationId === destinationId && row.network === "telegram" && row.status === "failed").length;
}

export function telegramItemTopic(db: GrowthDb, itemId: string): CopyTopic {
  const job = listJobs(db).find(
    (row) => row.itemId === itemId && row.network === "youtube" && (row.status === "published" || row.status === "processing")
  );
  const destination = job?.destinationId ? getDestination(db, job.destinationId) : null;
  if (!destination || destination.network !== "youtube") return "brand";
  return channelKind(destination);
}

function copyTasksFor(db: GrowthDb, itemId: string, pending: MirrorTask[]): MirrorTask[] {
  const home = getSetting(db, TELEGRAM_MIRROR_DESTINATION)?.trim();
  const topic = telegramItemTopic(db, itemId);
  const extra: MirrorTask[] = [];
  for (const copyId of telegramCopyIds(db)) {
    if (!copyId || copyId === home) continue;
    const destination = getDestination(db, copyId);
    if (!destination?.enabled || destination.network !== "telegram" || destination.kind === "bot_chat") continue;
    if (destination.config.copyTopic !== topic) continue;
    if (itemDelivered(db, itemId, copyId)) continue;
    if (pending.some((row) => row.itemId === itemId && row.destinationId === copyId) || extra.some((row) => row.destinationId === copyId)) continue;
    extra.push({ itemId, destinationId: copyId });
  }
  return extra;
}

/** Sends the oldest queued video. The home channel goes first, then the same video is copied to public channels. */
export async function advanceTelegramMirror(
  db: GrowthDb,
  publish: (item: Item, destination: Destination, copy: PackageCopyInput) => Promise<{ status?: string }>
): Promise<void> {
  const queue = readQueue(db);
  if (!queue.length) return;
  const task = queue[0]!;
  const rest = queue.slice(1);
  const destination = getDestination(db, task.destinationId);
  const item = getItem(db, task.itemId);
  if (!destination?.enabled || destination.network !== "telegram" || !item?.mediaPath) {
    writeQueue(db, rest);
    return;
  }
  if (itemDelivered(db, task.itemId, destination.id)) {
    const home = getSetting(db, TELEGRAM_MIRROR_DESTINATION)?.trim();
    writeQueue(db, destination.id === home ? [...rest, ...copyTasksFor(db, task.itemId, rest)] : rest);
    return;
  }
  if (failedMirrors(db, task.itemId, destination.id) >= MIRROR_ATTEMPTS) {
    writeQueue(db, rest);
    return;
  }
  const result = await publish(item, destination, telegramCopyForItem(db, item));
  if (result.status === "published" || result.status === "processing") {
    const home = getSetting(db, TELEGRAM_MIRROR_DESTINATION)?.trim();
    writeQueue(db, destination.id === home ? [...rest, ...copyTasksFor(db, task.itemId, rest)] : rest);
  }
}
