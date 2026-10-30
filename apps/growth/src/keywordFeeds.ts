import { nid } from "./crypto.js";
import {
  countPendingFeedEntries,
  getDestination,
  getKeywordFeed,
  insertKeywordFeed,
  listKeywordFeeds,
  listScriptEntries,
  nextFeedEntry,
  nextOpenSlot,
  openScriptRun,
  scriptSlotBuckets,
  updateKeywordFeed,
  type GrowthDb,
  type KeywordFeed
} from "./db.js";
import { textMatchesLanguage } from "./languageCopy.js";
import { freshConnectionTokens } from "./publish.js";
import { produceBankEntry, saveScriptEntry, type BankContext, type ScriptBankDeps } from "./scriptBank.js";
import { tokens, topicLabel } from "./youtubeTrends.js";

export const FEED_HOUR_OPTIONS = [1, 2, 4, 6, 8, 12, 24] as const;
const BATCH = 3;

export type FeedContext = BankContext;

export type FeedDeps = ScriptBankDeps & {
  search?: (query: string, language: string, accessToken: string) => Promise<string[]>;
  writeScripts?: (input: { query: string; language: string; ideas: string[] }) => Promise<Array<{ title: string; script: string }>>;
};

export function titlesFromSearch(payload: { items?: Array<{ snippet?: { title?: string } }> }): string[] {
  const titles: string[] = [];
  for (const item of payload.items ?? []) {
    const title = item.snippet?.title?.trim();
    if (title) titles.push(title);
  }
  return titles;
}

export function freshIdeas(titles: string[], used: string[], limit = 5): string[] {
  const memory = used.map((text) => tokens(text));
  const picked: string[] = [];
  for (const title of titles) {
    const label = topicLabel(title).trim();
    const words = tokens(label);
    if (words.length < 2) continue;
    const pool = [...memory, ...picked.map((item) => tokens(item))];
    if (pool.some((prev) => overlaps(words, prev))) continue;
    picked.push(label);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function saveKeywordFeed(
  db: GrowthDb,
  input: { id?: string; query?: string; language?: string; destinationId?: string | null; hours?: number; enabled?: boolean }
): { feed: KeywordFeed | null; error: string | null } {
  const query = (input.query ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (query.length < 2) return { feed: null, error: "כותבים מילת מפתח" };
  const language = (input.language ?? "he").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(language)) return { feed: null, error: "שפה חייבת להיות קוד בן שתי אותיות" };
  const hours = input.hours ?? 4;
  if (!(FEED_HOUR_OPTIONS as readonly number[]).includes(hours)) return { feed: null, error: "בחרו מרווח של 1, 2, 4, 6, 8, 12 או 24 שעות" };
  const destinationId = input.destinationId?.trim() || "";
  const destination = destinationId ? getDestination(db, destinationId) : null;
  if (!destination || destination.network !== "youtube" || destination.kind !== "channel" || !destination.enabled) {
    return { feed: null, error: "בחרו ערוץ יוטיוב פעיל" };
  }
  if (input.id) {
    const updated = updateKeywordFeed(db, input.id, { query, language, destinationId, hours, ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}) });
    return updated ? { feed: updated, error: null } : { feed: null, error: "מילת המפתח לא נמצאה" };
  }
  return { feed: insertKeywordFeed(db, { id: nid(), query, language, destinationId, hours, enabled: input.enabled === true }), error: null };
}

export function keywordFeedView(db: GrowthDb): { feeds: KeywordFeed[] } {
  return { feeds: listKeywordFeeds(db) };
}

export async function fillKeywordFeed(ctx: FeedContext, feedId: string, deps: FeedDeps = {}): Promise<{ added: number; error: string | null }> {
  const feed = getKeywordFeed(ctx.db, feedId);
  if (!feed) return { added: 0, error: "מילת המפתח לא נמצאה" };
  const destination = getDestination(ctx.db, feed.destinationId);
  if (!destination || destination.network !== "youtube" || !destination.enabled) {
    updateKeywordFeed(ctx.db, feed.id, { lastError: "בחרו ערוץ יוטיוב פעיל", lastFilledAt: new Date().toISOString() });
    return { added: 0, error: "בחרו ערוץ יוטיוב פעיל" };
  }
  let titles: string[] = [];
  try {
    const accessToken = deps.search
      ? ""
      : (await freshConnectionTokens(ctx.db, destination.connectionId, ctx.key, "youtube")).accessToken;
    titles = await (deps.search ?? searchYoutubeTitles)(feed.query, feed.language, accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    titles = [];
    if (!deps.writeScripts && !llmReady()) {
      updateKeywordFeed(ctx.db, feed.id, { lastError: message.slice(0, 300), lastFilledAt: new Date().toISOString() });
      return { added: 0, error: message.slice(0, 300) };
    }
  }
  const used = listScriptEntries(ctx.db).filter((entry) => entry.feedId === feed.id).map((entry) => `${entry.title}\n${entry.body}`);
  const ideas = freshIdeas(titles, used, 5);
  const subjects = ideas.length ? ideas : [feed.query];
  let written: Array<{ title: string; script: string }> = [];
  try {
    written = await (deps.writeScripts ?? writeScripts)({ query: feed.query, language: feed.language, ideas: subjects });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateKeywordFeed(ctx.db, feed.id, { lastError: message.slice(0, 300), lastFilledAt: new Date().toISOString() });
    return { added: 0, error: message.slice(0, 300) };
  }
  const accepted = written
    .map((item) => ({ title: item.title.replace(/\s+/g, " ").trim().slice(0, 90), script: item.script.trim().slice(0, 4000) }))
    .filter((item) => item.script.length >= 2 && textMatchesLanguage(item.script, feed.language) && (!item.title || textMatchesLanguage(item.title, feed.language)))
    .slice(0, BATCH);
  const items = accepted.length ? accepted.map((item) => ({ ...item, kind: "script" as const })) : fallbackItems(feed, subjects);
  let added = 0;
  for (const item of items) {
    const saved = saveScriptEntry(ctx.db, {
      kind: item.kind,
      title: item.title,
      body: item.script,
      language: feed.language,
      destinationId: feed.destinationId,
      feedId: feed.id
    });
    if (saved.entry) added += 1;
  }
  updateKeywordFeed(ctx.db, feed.id, { lastFilledAt: new Date().toISOString(), lastError: added ? null : "לא נוצרו פריטים חדשים" });
  return { added, error: added ? null : "לא נוצרו פריטים חדשים" };
}

export async function advanceKeywordFeeds(ctx: FeedContext, deps: FeedDeps = {}): Promise<void> {
  if (openScriptRun(ctx.db)) return;
  const now = deps.now ?? new Date();
  for (const feed of listKeywordFeeds(ctx.db).filter((row) => row.enabled)) {
    if (countPendingFeedEntries(ctx.db, feed.id, now) > 0 || !dueForFill(feed, now)) continue;
    await fillKeywordFeed(ctx, feed.id, deps);
  }
  if (openScriptRun(ctx.db)) return;
  for (const feed of listKeywordFeeds(ctx.db).filter((row) => row.enabled)) {
    const bucket = nextOpenSlot(feed.hours, now, scriptSlotBuckets(ctx.db, `feed-${feed.id}-`));
    if (bucket === null) continue;
    const slot = `feed-${feed.id}-${bucket}`;
    const entry = nextFeedEntry(ctx.db, feed.id, now);
    if (!entry) continue;
    await produceBankEntry(ctx, entry, slot, deps);
    return;
  }
}

export function feedSlotKey(feedId: string, now: Date, hours: number): string {
  const span = Math.max(1, hours) * 60 * 60 * 1000;
  return `feed-${feedId}-${Math.floor(now.getTime() / span)}`;
}

export async function searchYoutubeTitles(query: string, language: string, accessToken: string): Promise<string[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("q", query);
  url.searchParams.set("relevanceLanguage", language);
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`YouTube ${response.status}: ${text.slice(0, 180)}`);
  return titlesFromSearch(JSON.parse(text) as { items?: Array<{ snippet?: { title?: string } }> });
}

function overlaps(words: string[], prev: string[]): boolean {
  const shared = words.filter((word) => prev.includes(word)).length;
  if (shared < 2) return false;
  const union = new Set([...words, ...prev]).size;
  return union > 0 && shared / union >= 0.6;
}

function dueForFill(feed: KeywordFeed, now: Date): boolean {
  if (!feed.lastFilledAt) return true;
  const filled = Date.parse(feed.lastFilledAt);
  if (!Number.isFinite(filled)) return true;
  return now.getTime() - filled >= feed.hours * 60 * 60 * 1000;
}

function fallbackItems(feed: KeywordFeed, ideas: string[]): Array<{ title: string; script: string; kind: "keywords" }> {
  const matched = ideas.filter((idea) => textMatchesLanguage(idea, feed.language)).slice(0, BATCH);
  const bodies = matched.length ? matched : [feed.query];
  return bodies.map((script) => ({ title: "", script, kind: "keywords" as const }));
}

function llmReady(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

async function writeScripts(input: { query: string; language: string; ideas: string[] }): Promise<Array<{ title: string; script: string }>> {
  if (!llmReady()) return [];
  const languageName = input.language.startsWith("he") ? "Hebrew" : "English";
  const system = `You write original 30-second vertical video scripts for YouTube Shorts. The title and the script must be entirely in ${languageName}. Do not copy another creator's title, script, or wording. Each script is 4 to 6 short narration lines about one practical tip.`;
  const user = `Keyword: ${input.query}\nCover these subjects without copying their wording:\n${input.ideas.map((idea) => `- ${idea}`).join("\n")}\nReturn JSON {"items":[{"title":"","script":""}]} with up to ${BATCH} items.`;
  const raw = process.env.GEMINI_API_KEY?.trim()
    ? await gemini(system, user)
    : await openai(system, user);
  const parsed = JSON.parse(extractJson(raw)) as { items?: Array<{ title?: string; script?: string }> };
  return (parsed.items ?? [])
    .map((item) => ({ title: String(item.title ?? ""), script: String(item.script ?? "") }))
    .filter((item) => item.script.trim());
}

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("המערכת לא החזירה תסריטים");
  return raw.slice(start, end + 1);
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
