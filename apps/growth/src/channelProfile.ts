import { createHash } from "node:crypto";
import { channelBrandingUpdate } from "@studio/providers";
import type { PackageCopyInput } from "@studio/shared";
import { destinationsForNetwork, getConnection, getSetting, setSetting, type Destination, type GrowthDb } from "./db.js";

const TAG_LIMIT = 30;
const TAG_CHARS = 500;

const BRAND_DESCRIPTION = [
  "Reelmino turns one sentence into a finished branded video for a small business. Write what the business wants to say, and Reelmino prepares the script, the scenes, and a video ad you can publish.",
  "Reelmino הופכת משפט אחד לסרטון ממותג לעסק. כותבים מה העסק רוצה להגיד, והמערכת מכינה תסריט, סצנות וסרטון מוכן לפרסום. יצירת וידאו, מודעות וידאו וסרטונים קצרים לעסקים.",
  "https://reelmino.com"
].join("\n\n");

const KITCHEN_DESCRIPTION = [
  "Original kitchen tips for home cooks: food storage, prep, layout, and everyday cooking. Each video is one practical idea.",
  "הסרטונים האלה נוצרים ב-Reelmino, המערכת שהופכת משפט אחד לסרטון. יצירת וידאו, טיפים למטבח וסרטונים קצרים.",
  "https://reelmino.com"
].join("\n\n");

const PRODUCT_KEYWORDS = [
  "Reelmino",
  "video creation",
  "AI video",
  "video maker",
  "branded video",
  "one sentence video",
  "יצירת וידאו",
  "יצירת סרטונים",
  "סרטון ממותג",
  "בינה מלאכותית"
];

const BRAND_KEYWORDS = [
  ...PRODUCT_KEYWORDS,
  "business video",
  "video ads",
  "small business",
  "סרטון לעסק",
  "מודעת וידאו"
];

const KITCHEN_KEYWORDS = [
  "kitchen tips",
  "cooking tips",
  "food storage",
  "meal prep",
  "kitchen layout",
  "home cooking",
  "טיפים למטבח",
  ...PRODUCT_KEYWORDS
];

const BRAND_TAGS = [
  "Reelmino",
  "video creation",
  "יצירת וידאו",
  "AI video",
  "video maker",
  "business video",
  "video ads",
  "branded video",
  "one sentence video",
  "יצירת סרטונים",
  "סרטון לעסק",
  "small business"
];

const KITCHEN_TAGS = [
  "Reelmino",
  "video creation",
  "יצירת וידאו",
  "AI video",
  "kitchen tips",
  "cooking tips",
  "food storage",
  "טיפים למטבח",
  "home cooking",
  "meal prep",
  "יצירת סרטונים",
  "branded video"
];

export type ChannelKind = "brand" | "kitchen";

export type ChannelProfile = {
  kind: ChannelKind;
  description: string;
  keywords: string;
  videoTags: string[];
};

type ChannelRef = { handle?: string | null; name?: string; url?: string | null };

export function channelKind(destination: ChannelRef): ChannelKind {
  return /kitchentips/i.test(`${destination.handle ?? ""} ${destination.name ?? ""} ${destination.url ?? ""}`) ? "kitchen" : "brand";
}

export function keywordField(phrases: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const phrase of phrases) {
    const clean = phrase.replace(/["\n\r]/g, "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const token = /\s/.test(clean) ? `"${clean}"` : clean;
    const next = parts.length ? `${parts.join(" ")} ${token}` : token;
    if (next.length > 500) break;
    parts.push(token);
  }
  return parts.join(" ");
}

export function profileFor(destination: ChannelRef): ChannelProfile {
  const kind = channelKind(destination);
  return kind === "kitchen"
    ? { kind, description: KITCHEN_DESCRIPTION, keywords: keywordField(KITCHEN_KEYWORDS), videoTags: KITCHEN_TAGS }
    : { kind, description: BRAND_DESCRIPTION, keywords: keywordField(BRAND_KEYWORDS), videoTags: BRAND_TAGS };
}

function footerLine(kind: ChannelKind, hebrew: boolean): string {
  if (kind === "kitchen") {
    return hebrew
      ? "טיפ למטבח שנוצר ב-Reelmino. יצירת וידאו: משפט אחד הופך לסרטון ממותג לעסק."
      : "A kitchen tip made with Reelmino. Video creation for a small business: one sentence becomes a branded video.";
  }
  return hebrew
    ? "Reelmino: יצירת וידאו לעסק. משפט אחד הופך לסרטון ממותג שאפשר לפרסם."
    : "Reelmino: video creation for a small business. One sentence becomes a branded video you can publish.";
}

export function mergeTags(primary: string[], extra: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  let chars = 0;
  for (const raw of [...primary, ...extra]) {
    const tag = raw.replace(/^#/, "").replace(/["\n\r]/g, "").trim();
    if (!tag || tag.toLowerCase() === "shorts") continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    const next = chars + tag.length + (tags.length ? 1 : 0);
    if (tags.length >= TAG_LIMIT || next > TAG_CHARS) break;
    seen.add(key);
    tags.push(tag);
    chars = next;
  }
  return tags;
}

export function applyVideoProfile(copy: PackageCopyInput, destination: ChannelRef): PackageCopyInput {
  const profile = profileFor(destination);
  const hebrew = (copy.language ?? "").toLowerCase().startsWith("he");
  const line = footerLine(profile.kind, hebrew);
  let body = (copy.body ?? "").trim();
  if (line && !body.includes(line)) body = body ? `${body}\n\n${line}` : line;
  if (!/reelmino\.com/i.test(body)) body = `${body}\nhttps://reelmino.com`;
  const own = [...(copy.hashtags ?? []), ...(body.match(/#([\p{L}\p{N}_]+)/gu) ?? []).map((tag) => tag.slice(1))];
  return { ...copy, body: body.trim(), hashtags: mergeTags(profile.videoTags, own) };
}

function profileHash(profile: ChannelProfile): string {
  return createHash("sha256").update(`${profile.description}\n${profile.keywords}`).digest("hex").slice(0, 20);
}

async function readBranding(accessToken: string, channelId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&id=${encodeURIComponent(channelId)}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`youtube channel read HTTP ${response.status}: ${text.slice(0, 240)}`);
  const data = JSON.parse(text) as { items?: Array<{ brandingSettings?: { channel?: Record<string, unknown> } }> };
  return data.items?.[0]?.brandingSettings?.channel ?? {};
}

export async function writeChannelBranding(accessToken: string, channelId: string, profile: ChannelProfile): Promise<void> {
  const existing = await readBranding(accessToken, channelId);
  const payload = channelBrandingUpdate({
    channelId,
    description: profile.description,
    keywords: profile.keywords,
    existing
  });
  const response = await fetch("https://www.googleapis.com/youtube/v3/channels?part=brandingSettings", {
    method: "PUT",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`youtube channel update HTTP ${response.status}: ${text.slice(0, 240)}`);
}

export async function ensureYouTubeChannels(
  db: GrowthDb,
  tokensFor: (connectionId: string) => Promise<{ accessToken: string }>
): Promise<void> {
  const channels = destinationsForNetwork(db, "youtube").filter((row) => row.enabled && row.kind === "channel");
  for (const destination of channels) {
    await ensureOne(db, destination, tokensFor);
  }
}

async function ensureOne(
  db: GrowthDb,
  destination: Destination,
  tokensFor: (connectionId: string) => Promise<{ accessToken: string }>
): Promise<void> {
  const connection = getConnection(db, destination.connectionId);
  if (!connection || connection.status === "needs_reauth" || connection.status === "revoked") return;
  const profile = profileFor(destination);
  const hash = profileHash(profile);
  const savedKey = `yt_channel_profile:${destination.id}`;
  if (getSetting(db, savedKey) === hash) return;
  const waitKey = `yt_channel_profile_wait:${destination.id}`;
  const wait = getSetting(db, waitKey);
  if (wait && Date.parse(wait) > Date.now()) return;
  try {
    const tokens = await tokensFor(destination.connectionId);
    await writeChannelBranding(tokens.accessToken, destination.externalId, profile);
    setSetting(db, savedKey, hash);
    setSetting(db, waitKey, "");
    console.log(`[growth] channel profile updated ${destination.handle || destination.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const auth = /invalid_grant|expired or revoked|HTTP 401|HTTP 403/.test(message);
    if (auth) {
      db.prepare("UPDATE connections SET status = ?, updated_at = ? WHERE id = ?").run("needs_reauth", new Date().toISOString(), connection.id);
      setSetting(db, waitKey, "");
    } else {
      setSetting(db, waitKey, new Date(Date.now() + 15 * 60 * 1000).toISOString());
    }
    console.error(`[growth] channel profile ${destination.handle || destination.id} failed`, message.slice(0, 240));
  }
}
