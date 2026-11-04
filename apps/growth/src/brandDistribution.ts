import { slugify } from "./catalog.js";
import { emptyCopy } from "./copy.js";
import { nid } from "./crypto.js";
import {
  destinationsForNetwork,
  getDestination,
  getItem,
  getSetting,
  insertItem,
  itemDelivered,
  listItems,
  setSetting,
  updateItem,
  type Destination,
  type GrowthDb,
  type Item
} from "./db.js";
import { durationPhrase, taskDurationSeconds } from "./duration.js";
import { subscribeCue, subscribeCueNote } from "./languageCopy.js";
import { submitReelminoBrief } from "./produce.js";

const HOURS = [1, 2, 4, 6, 8, 12, 24] as const;
const ORDER_KEY = "brand_order";

export type BrandSettings = {
  enabled: boolean;
  hours: number;
  destinationId: string | null;
};

export type BrandRow = {
  id: string;
  title: string;
  summary: string;
  source: string;
  hasVideo: boolean;
  producing: boolean;
  published: boolean;
};

export function readBrandSettings(db: GrowthDb): BrandSettings {
  const hoursRaw = Number(getSetting(db, "brand_dist_hours") ?? "4");
  return {
    enabled: getSetting(db, "brand_dist_enabled") === "1",
    hours: (HOURS as readonly number[]).includes(hoursRaw) ? hoursRaw : 4,
    destinationId: getSetting(db, "brand_dist_destination")?.trim() || null
  };
}

export function applyBrandSettings(
  db: GrowthDb,
  patch: Partial<{ enabled: boolean; hours: number; destinationId: string | null }>
): string | null {
  if (patch.hours !== undefined && !(HOURS as readonly number[]).includes(patch.hours)) {
    return "בחרו מרווח של 1, 2, 4, 6, 8, 12 או 24 שעות";
  }
  if (patch.destinationId) {
    const row = getDestination(db, patch.destinationId);
    if (!row || row.network !== "youtube" || row.kind !== "channel" || !row.enabled) return "בחרו ערוץ יוטיוב פעיל";
  }
  if (patch.enabled !== undefined) setSetting(db, "brand_dist_enabled", patch.enabled ? "1" : "0");
  if (patch.hours !== undefined) setSetting(db, "brand_dist_hours", String(patch.hours));
  if (patch.destinationId !== undefined) setSetting(db, "brand_dist_destination", patch.destinationId ?? "");
  return null;
}

export function isBrandItem(item: Item): boolean {
  return item.source === "kit" || item.source === "brand";
}

function kitNumber(item: Item): number | null {
  const match = /^kit-(\d+)-/.exec(item.slug);
  return match ? Number(match[1]) : null;
}

export function orderedBrandItems(db: GrowthDb): Item[] {
  const items = listItems(db).filter(isBrandItem);
  const byId = new Map(items.map((item) => [item.id, item]));
  const saved = (getSetting(db, ORDER_KEY) ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const ordered: Item[] = [];
  for (const id of saved) {
    const item = byId.get(id);
    if (!item) continue;
    ordered.push(item);
    byId.delete(id);
  }
  const rest = [...byId.values()].sort((a, b) => {
    const left = kitNumber(a);
    const right = kitNumber(b);
    if (left != null && right != null && left !== right) return left - right;
    if (left != null && right == null) return -1;
    if (left == null && right != null) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return [...ordered, ...rest];
}

function writeOrder(db: GrowthDb, items: Item[]): void {
  setSetting(db, ORDER_KEY, items.map((item) => item.id).join(","));
}

export function moveBrandItem(db: GrowthDb, id: string, direction: -1 | 1): string | null {
  const items = orderedBrandItems(db);
  const index = items.findIndex((item) => item.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return "אי אפשר להזיז את הפריט";
  const swap = items[index]!;
  items[index] = items[next]!;
  items[next] = swap;
  writeOrder(db, items);
  return null;
}

export function brandChannel(db: GrowthDb, destinationId: string | null): Destination | null {
  if (destinationId) {
    const chosen = getDestination(db, destinationId);
    if (chosen?.network === "youtube" && chosen.kind === "channel" && chosen.enabled) return chosen;
    return null;
  }
  const channels = destinationsForNetwork(db, "youtube").filter((row) => row.enabled && row.kind === "channel");
  const brand = channels.find((row) => !/kitchentips/i.test(`${row.handle ?? ""} ${row.name} ${row.url ?? ""}`));
  return brand ?? channels[0] ?? null;
}

export function brandView(db: GrowthDb): BrandSettings & { items: BrandRow[] } {
  const settings = readBrandSettings(db);
  return {
    ...settings,
    items: orderedBrandItems(db).map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      source: item.source,
      hasVideo: Boolean(item.mediaPath),
      producing: Boolean(item.reelminoRunId && !item.mediaPath),
      published: settings.destinationId ? itemDelivered(db, item.id, settings.destinationId) : false
    }))
  };
}

export function nextBrandVideo(db: GrowthDb, destinationId: string): Item | null {
  return orderedBrandItems(db).find((item) => item.mediaPath && !itemDelivered(db, item.id, destinationId)) ?? null;
}

export function briefForBrandVideo(input: { title: string; body: string; language: string; durationSeconds: number }): Record<string, unknown> {
  const he = input.language.startsWith("he");
  const form = durationPhrase(input.durationSeconds, input.language);
  const title = input.title.trim();
  return {
    title,
    sourceText: input.body.trim(),
    instructions: he
      ? `הסרטון הוא רק על Reelmino, המערכת שהופכת משפט אחד לסרטון ממותג לעסק. לא מדברים על נושאים אחרים. אורך הסרטון הוא ${form}. ${subscribeCueNote(input.language)} כותרת הסרטון ביוטיוב היא בדיוק: ${title}`
      : `This video is only about Reelmino, the product that turns one sentence into a finished branded business video. Do not cover any other subject. The video length is ${form}. ${subscribeCueNote(input.language)} The YouTube title is exactly: ${title}`,
    targetAudience: he ? "בעלי עסקים" : "small business owners",
    language: input.language,
    durationSeconds: input.durationSeconds,
    branding: { slogan: subscribeCue(input.language) },
    aspectRatio: "9:16",
    budgetMode: true,
    approvalMode: "auto"
  };
}

export async function createBrandVideo(
  db: GrowthDb,
  input: { title?: string; body?: string; language?: string; durationSeconds?: number },
  submit: (brief: Record<string, unknown>) => Promise<string> = submitReelminoBrief
): Promise<{ item: Item | null; error: string | null }> {
  const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
  const body = (input.body ?? "").trim().slice(0, 4000);
  if (title.length < 2 || body.length < 2) return { item: null, error: "כותבים כותרת ותוכן על המערכת" };
  const language = (input.language ?? "en").trim().toLowerCase();
  if (language !== "he" && language !== "en") return { item: null, error: "השפה היא עברית או אנגלית" };
  const durationSeconds = taskDurationSeconds(input.durationSeconds ?? 30);
  if (!durationSeconds) return { item: null, error: "בחרו אורך סרטון: 30 שניות, דקה, 2 דקות, 3 דקות, 5 דקות או 10 דקות" };
  const copy = emptyCopy();
  copy.youtube = { title, body };
  const item = insertItem(db, {
    id: nid(),
    slug: `brand-${slugify(title)}-${nid().slice(0, 4)}`,
    source: "brand",
    title,
    summary: body.slice(0, 240),
    language,
    copy,
    mediaPath: null,
    mediaMime: null,
    mediaKind: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationMs: null,
    reelminoRunId: null
  });
  const current = orderedBrandItems(db);
  writeOrder(db, current);
  try {
    const runId = await submit(briefForBrandVideo({ title, body, language, durationSeconds }));
    return { item: updateItem(db, item.id, { reelminoRunId: runId }), error: null };
  } catch (error) {
    return { item, error: error instanceof Error ? error.message : String(error) };
  }
}

export function createBrandContent(
  db: GrowthDb,
  input: { title?: string; summary?: string; youtube?: string; x?: string; linkedin?: string; language?: string }
): { item: Item | null; error: string | null } {
  const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
  const summary = (input.summary ?? "").trim().slice(0, 1000);
  if (title.length < 2 || summary.length < 2) return { item: null, error: "כותבים כותרת ותוכן על המערכת" };
  const language = (input.language ?? "en").trim().toLowerCase();
  if (language !== "he" && language !== "en") return { item: null, error: "השפה היא עברית או אנגלית" };
  const copy = emptyCopy();
  copy.youtube = { title, body: (input.youtube ?? summary).trim() };
  copy.x = { body: (input.x ?? "").trim().slice(0, 280) };
  copy.linkedin = { body: (input.linkedin ?? summary).trim().slice(0, 3000) };
  const item = insertItem(db, {
    id: nid(),
    slug: `brand-${slugify(title)}-${nid().slice(0, 4)}`,
    source: "brand",
    title,
    summary,
    language,
    copy,
    mediaPath: null,
    mediaMime: null,
    mediaKind: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaDurationMs: null,
    reelminoRunId: null
  });
  writeOrder(db, orderedBrandItems(db));
  return { item, error: null };
}

export async function publishNextBrand(
  db: GrowthDb,
  publish: (item: Item, destination: Destination) => Promise<unknown>
): Promise<string | null> {
  const settings = readBrandSettings(db);
  const destination = brandChannel(db, settings.destinationId);
  if (!destination) return "בחרו ערוץ יוטיוב להפצת המותג";
  const item = nextBrandVideo(db, destination.id);
  if (!item) return "אין סרטון מוכן. קודם מפיקים או מושכים את הסרטון הבא בסדר.";
  await publish(item, destination);
  return null;
}

export async function advanceBrandDistribution(
  db: GrowthDb,
  publish: (item: Item, destination: Destination) => Promise<unknown>,
  now = new Date()
): Promise<void> {
  const settings = readBrandSettings(db);
  if (!settings.enabled) return;
  const destination = brandChannel(db, settings.destinationId);
  if (!destination) return;
  const last = Number(getSetting(db, "brand_dist_bucket") ?? "");
  const span = settings.hours * 60 * 60 * 1000;
  const current = Math.floor(now.getTime() / span);
  if (Number.isFinite(last) && last >= current) return;
  const item = nextBrandVideo(db, destination.id);
  if (!item) return;
  setSetting(db, "brand_dist_bucket", String(current));
  await publish(item, destination);
}

export function brandItem(db: GrowthDb, id: string): Item | null {
  const item = getItem(db, id);
  return item && isBrandItem(item) ? item : null;
}
