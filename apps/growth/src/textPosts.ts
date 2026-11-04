import { nid } from "./crypto.js";
import { emptyCopy } from "./copy.js";
import { slugify } from "./catalog.js";
import {
  getDestination,
  insertItem,
  nextOpenSlot,
  type Destination,
  type GrowthDb,
  type Item
} from "./db.js";

export const TEXT_NETWORKS = ["x", "linkedin"] as const;
export type TextNetwork = (typeof TEXT_NETWORKS)[number];
const HOURS = [1, 2, 4, 6, 8, 12, 24] as const;
const BATCH = 3;

export type TextCampaign = {
  id: string;
  network: TextNetwork;
  query: string;
  language: string;
  destinationId: string | null;
  hours: number;
  enabled: boolean;
  lastFilledAt: string | null;
  lastError: string | null;
};

export type TextPost = {
  id: string;
  campaignId: string;
  network: TextNetwork;
  body: string;
  position: number;
  status: string;
  remoteUrl: string | null;
  error: string | null;
};

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function num(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function postLimit(network: string): number {
  return network === "x" ? 280 : 3000;
}

export function shapePost(network: string, body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  const limit = postLimit(network);
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1).trimEnd();
  return `${cut}…`;
}

export function postsFromModel(network: string, items: Array<{ text?: string }>): string[] {
  const seen = new Set<string>();
  const posts: string[] = [];
  for (const item of items) {
    const text = shapePost(network, String(item.text ?? ""));
    if (text.length < 2 || seen.has(text)) continue;
    seen.add(text);
    posts.push(text);
    if (posts.length >= BATCH) break;
  }
  return posts;
}

function mapCampaign(row: Row): TextCampaign {
  const network = str(row, "network") === "linkedin" ? "linkedin" : "x";
  return {
    id: str(row, "id"),
    network,
    query: str(row, "query"),
    language: str(row, "language"),
    destinationId: str(row, "destination_id") || null,
    hours: num(row, "hours"),
    enabled: num(row, "enabled") === 1,
    lastFilledAt: str(row, "last_filled_at") || null,
    lastError: str(row, "last_error") || null
  };
}

function mapPost(row: Row): TextPost {
  const network = str(row, "network") === "linkedin" ? "linkedin" : "x";
  return {
    id: str(row, "id"),
    campaignId: str(row, "campaign_id"),
    network,
    body: str(row, "body"),
    position: num(row, "position"),
    status: str(row, "status"),
    remoteUrl: str(row, "remote_url") || null,
    error: str(row, "error") || null
  };
}

export function listTextCampaigns(db: GrowthDb): TextCampaign[] {
  return (db.prepare("SELECT * FROM text_campaigns ORDER BY created_at").all() as Row[]).map(mapCampaign);
}

export function listTextPosts(db: GrowthDb, campaignId?: string): TextPost[] {
  const rows = campaignId
    ? (db.prepare("SELECT * FROM text_posts WHERE campaign_id = ? ORDER BY position, created_at").all(campaignId) as Row[])
    : (db.prepare("SELECT * FROM text_posts ORDER BY position, created_at").all() as Row[]);
  return rows.map(mapPost);
}

export function textView(db: GrowthDb): { campaigns: TextCampaign[]; posts: TextPost[] } {
  return { campaigns: listTextCampaigns(db), posts: listTextPosts(db) };
}

function nextPosition(db: GrowthDb, campaignId: string): number {
  const row = db.prepare("SELECT COALESCE(MAX(position), 0) AS n FROM text_posts WHERE campaign_id = ?").get(campaignId) as Row | undefined;
  return (row ? num(row, "n") : 0) + 1;
}

export function addTextPost(db: GrowthDb, campaign: TextCampaign, body: string): TextPost | null {
  const text = shapePost(campaign.network, body);
  if (text.length < 2) return null;
  const id = nid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO text_posts (id, campaign_id, network, body, position, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)`
  ).run(id, campaign.id, campaign.network, text, nextPosition(db, campaign.id), now, now);
  return listTextPosts(db, campaign.id).find((post) => post.id === id) ?? null;
}

export function saveTextCampaign(
  db: GrowthDb,
  input: { id?: string; network?: string; query?: string; language?: string; destinationId?: string | null; hours?: number; enabled?: boolean }
): { campaign: TextCampaign | null; error: string | null } {
  const network = input.network === "linkedin" || input.network === "x" ? input.network : null;
  if (!network) return { campaign: null, error: "הרשת היא X או לינקדאין" };
  const query = (input.query ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (query.length < 2) return { campaign: null, error: "כותבים נושא או מילת מפתח" };
  const language = (input.language ?? "en").trim().toLowerCase();
  if (language !== "he" && language !== "en") return { campaign: null, error: "השפה היא עברית או אנגלית" };
  const hours = input.hours ?? 4;
  if (!(HOURS as readonly number[]).includes(hours)) return { campaign: null, error: "בחרו מרווח של 1, 2, 4, 6, 8, 12 או 24 שעות" };
  const destinationId = input.destinationId?.trim() || null;
  if (destinationId) {
    const destination = getDestination(db, destinationId);
    if (!destination || destination.network !== network || !destination.enabled) return { campaign: null, error: "בחרו יעד פעיל של הרשת" };
  }
  const now = new Date().toISOString();
  if (input.id) {
    const current = campaignById(db, input.id);
    if (!current) return { campaign: null, error: "המשימה לא נמצאה" };
    const enabled = typeof input.enabled === "boolean" ? input.enabled : current.enabled;
    db.prepare(
      `UPDATE text_campaigns SET query = ?, language = ?, destination_id = ?, hours = ?, enabled = ?, updated_at = ? WHERE id = ?`
    ).run(query, language, destinationId, hours, enabled ? 1 : 0, now, input.id);
    const campaign = listTextCampaigns(db).find((row) => row.id === input.id) ?? null;
    return campaign ? { campaign, error: null } : { campaign: null, error: "המשימה לא נמצאה" };
  }
  const id = nid();
  db.prepare(
    `INSERT INTO text_campaigns (id, network, query, language, destination_id, hours, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, network, query, language, destinationId, hours, now, now);
  return { campaign: listTextCampaigns(db).find((row) => row.id === id) ?? null, error: null };
}

export function deleteTextCampaign(db: GrowthDb, id: string): boolean {
  if (!campaignById(db, id)) return false;
  db.prepare("DELETE FROM text_posts WHERE campaign_id = ?").run(id);
  db.prepare("DELETE FROM text_campaigns WHERE id = ?").run(id);
  return true;
}

export function markTextPosted(db: GrowthDb, id: string): void {
  const now = new Date().toISOString();
  db.prepare("UPDATE text_posts SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
}

function campaignById(db: GrowthDb, id: string): TextCampaign | null {
  const row = db.prepare("SELECT * FROM text_campaigns WHERE id = ?").get(id) as Row | undefined;
  return row ? mapCampaign(row) : null;
}

export async function fillTextCampaign(
  db: GrowthDb,
  id: string,
  write: (input: { network: TextNetwork; query: string; language: string }) => Promise<string[]>
): Promise<{ added: number; error: string | null }> {
  const campaign = campaignById(db, id);
  if (!campaign) return { added: 0, error: "המשימה לא נמצאה" };
  const now = new Date().toISOString();
  try {
    const written = await write({ network: campaign.network, query: campaign.query, language: campaign.language });
    let added = 0;
    for (const body of written) {
      if (addTextPost(db, campaign, body)) added += 1;
    }
    db.prepare("UPDATE text_campaigns SET last_filled_at = ?, last_error = NULL, updated_at = ? WHERE id = ?").run(now, now, id);
    return { added, error: added ? null : "לא נוצרו טקסטים" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare("UPDATE text_campaigns SET last_error = ?, updated_at = ? WHERE id = ?").run(message.slice(0, 240), now, id);
    return { added: 0, error: message };
  }
}

function slotBuckets(db: GrowthDb, campaignId: string): number[] {
  const prefix = `text-${campaignId}-`;
  const found: number[] = [];
  for (const row of db.prepare("SELECT slot_key FROM text_posts WHERE slot_key LIKE ?").all(`${prefix}%`) as Row[]) {
    const rest = str(row, "slot_key").slice(prefix.length);
    if (/^\d+$/.test(rest)) found.push(Number(rest));
  }
  return found;
}

function nextReady(db: GrowthDb, campaignId: string): TextPost | null {
  return listTextPosts(db, campaignId).find((post) => post.status === "ready") ?? null;
}

export function linkedinItemForPost(db: GrowthDb, post: TextPost, language: string): Item {
  const copy = emptyCopy();
  copy.linkedin = { body: post.body };
  return insertItem(db, {
    id: nid(),
    slug: `linkedin-${slugify(post.body).slice(0, 40)}-${post.id.slice(0, 4)}`,
    source: "text",
    title: post.body.slice(0, 80),
    summary: post.body.slice(0, 240),
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
}

export async function advanceTextCampaigns(
  db: GrowthDb,
  publish: (item: Item, destination: Destination) => Promise<{ remoteUrl?: string | null; status?: string; lastError?: string | null }>,
  write: (input: { network: TextNetwork; query: string; language: string }) => Promise<string[]>,
  now = new Date()
): Promise<void> {
  for (const campaign of listTextCampaigns(db).filter((row) => row.enabled)) {
    const ready = nextReady(db, campaign.id);
    if (!ready && dueForFill(campaign, now)) await fillTextCampaign(db, campaign.id, write);
  }
  for (const campaign of listTextCampaigns(db).filter((row) => row.enabled && row.network === "linkedin")) {
    const bucket = nextOpenSlot(campaign.hours, now, slotBuckets(db, campaign.id));
    if (bucket === null) continue;
    const post = nextReady(db, campaign.id);
    const destination = campaign.destinationId ? getDestination(db, campaign.destinationId) : null;
    if (!post || !destination || destination.network !== "linkedin" || !destination.enabled) continue;
    const slot = `text-${campaign.id}-${bucket}`;
    db.prepare("UPDATE text_posts SET slot_key = ?, updated_at = ? WHERE id = ?").run(slot, now.toISOString(), post.id);
    const item = linkedinItemForPost(db, post, campaign.language);
    try {
      const result = await publish(item, destination);
      const posted = result.status === "published" || result.status === "processing" || result.status === "uploading";
      db.prepare("UPDATE text_posts SET status = ?, remote_url = ?, error = ?, posted_at = ?, updated_at = ? WHERE id = ?").run(
        posted ? "posted" : "failed",
        result.remoteUrl ?? null,
        posted ? null : result.lastError ?? "הפרסום נכשל",
        posted ? now.toISOString() : null,
        now.toISOString(),
        post.id
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      db.prepare("UPDATE text_posts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(message.slice(0, 240), now.toISOString(), post.id);
    }
    return;
  }
}

function dueForFill(campaign: TextCampaign, now: Date): boolean {
  if (!campaign.lastFilledAt) return true;
  const filled = Date.parse(campaign.lastFilledAt);
  if (!Number.isFinite(filled)) return true;
  return now.getTime() - filled >= campaign.hours * 60 * 60 * 1000;
}

export function textPrompt(input: { network: TextNetwork; query: string; language: string }): { system: string; user: string } {
  const languageName = input.language.startsWith("he") ? "Hebrew" : "English";
  const shape = input.network === "x"
    ? "Each post is one original X post of at most 240 characters. No hashtag pile, no video script, no scene directions."
    : "Each post is one original LinkedIn post of 400 to 900 characters. It opens with the point, stays professional, and does not read like a video script.";
  return {
    system: `You write original ${input.network === "x" ? "X" : "LinkedIn"} posts. Every post is entirely in ${languageName}. Do not copy another person's wording. ${shape}`,
    user: `Subject: ${input.query}\nReturn JSON {"items":[{"text":""}]} with up to ${BATCH} posts.`
  };
}

export async function writeTextPosts(input: { network: TextNetwork; query: string; language: string }): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) return [];
  const prompt = textPrompt(input);
  const raw = process.env.GEMINI_API_KEY?.trim() ? await gemini(prompt.system, prompt.user) : await openai(prompt.system, prompt.user);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("המערכת לא החזירה טקסטים");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { items?: Array<{ text?: string }> };
  return postsFromModel(input.network, parsed.items ?? []);
}

async function gemini(system: string, user: string): Promise<string> {
  const model = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.0-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!.trim())}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.6, responseMimeType: "application/json" }
      })
    }
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${text.slice(0, 180)}`);
  const payload = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function openai(system: string, user: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}` },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${text.slice(0, 180)}`);
  const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? "";
}
