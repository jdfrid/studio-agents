import {
  evaluateShortsGate,
  SHORTS_DEFAULT_DAILY_CAP,
  type ShortsChannelKind,
  type ShortsGateResult
} from "@studio/shared";
import type { PackageCopyInput } from "@studio/shared";
import { channelKind } from "./channelProfile.js";
import { getSetting, type Destination, type GrowthDb, type Item } from "./db.js";
import { jerusalemDayStart } from "./youtubeQuota.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function readShortsDailyCap(db: GrowthDb): number {
  const fromEnv = process.env.SHORTS_DAILY_CAP?.trim();
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 50) return parsed;
  }
  const stored = getSetting(db, "shorts_daily_cap")?.trim();
  if (stored) {
    const parsed = Number(stored);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 50) return parsed;
  }
  return SHORTS_DEFAULT_DAILY_CAP;
}

export function countShortsToday(db: GrowthDb, destinationId: string, now = new Date(), exceptJobId?: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM jobs
       WHERE network = 'youtube' AND destination_id = ? AND created_at >= ?
       AND status IN ('published', 'processing', 'uploading', 'draft')
       AND id != ?`
    )
    .get(destinationId, jerusalemDayStart(now), exceptJobId ?? "") as { n?: number } | undefined;
  return Number(row?.n ?? 0);
}

export function recentChannelPosts(
  db: GrowthDb,
  destinationId: string,
  now = new Date(),
  exceptJobId?: string
): Array<{ title: string; script: string; publishedAt: string }> {
  const since = new Date(now.getTime() - 14 * DAY_MS).toISOString();
  const rows = db
    .prepare(
      `SELECT items.title AS title, items.copy_json AS copy_json, jobs.handle_json AS handle_json, jobs.created_at AS created_at
       FROM jobs JOIN items ON items.id = jobs.item_id
       WHERE jobs.network = 'youtube' AND jobs.destination_id = ? AND jobs.created_at >= ?
       AND jobs.status IN ('published', 'processing', 'uploading', 'draft')
       AND jobs.id != ?
       ORDER BY jobs.created_at DESC LIMIT 40`
    )
    .all(destinationId, since, exceptJobId ?? "") as Array<{ title?: string; copy_json?: string; handle_json?: string; created_at?: string }>;
  return rows.map((row) => {
    const handle = parseJson(row.handle_json);
    const copy = parseJson(row.copy_json);
    const caption = record(handle.caption);
    const snippet = record(handle.snippet);
    const article = record(copy.article);
    const title = stringValue(snippet.title) || stringValue(caption.title) || row.title || "";
    const script = stringValue(article.body) || stringValue(article.description) || "";
    return { title, script, publishedAt: row.created_at || "" };
  });
}

export function mp4DurationSeconds(body: Uint8Array): number | null {
  const view = Buffer.from(body);
  const at = view.indexOf("mvhd");
  if (at < 0 || at + 8 > view.length) return null;
  const start = at + 4;
  const version = view[start];
  if (version === 0 && view.length >= start + 20) {
    const timescale = view.readUInt32BE(start + 12);
    const duration = view.readUInt32BE(start + 16);
    return timescale ? duration / timescale : null;
  }
  if (version === 1 && view.length >= start + 32) {
    const timescale = view.readUInt32BE(start + 20);
    const duration = view.readUInt32BE(start + 24) * 2 ** 32 + view.readUInt32BE(start + 28);
    return timescale ? duration / timescale : null;
  }
  return null;
}

export async function judgeTitleWithModel(
  input: { title: string; script: string; language: string },
  options: { fetchImpl?: typeof fetch; enabled?: boolean } = {}
): Promise<{ matches: boolean; reason: string } | null> {
  const enabled = options.enabled ?? llmEnabled();
  if (!enabled) return null;
  const script = input.script.trim();
  if (!script) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const system = "You check whether a YouTube Shorts title describes the spoken script. Reply with JSON {\"matches\":true|false,\"reason\":\"...\"}. matches is false when the title is generic, about a different subject, or could not be searched for this video. Do not suggest a replacement title.";
  const user = `Language: ${input.language}\nTitle: ${input.title}\nScript:\n${script.slice(0, 2000)}`;
  try {
    const raw = process.env.GEMINI_API_KEY?.trim()
      ? await gemini(system, user, fetchImpl)
      : await openai(system, user, fetchImpl);
    const parsed = JSON.parse(extractJson(raw)) as { matches?: boolean; reason?: string };
    if (typeof parsed.matches !== "boolean") return null;
    return { matches: parsed.matches, reason: String(parsed.reason ?? "").slice(0, 240) };
  } catch {
    return null;
  }
}

export async function reviewYoutubeShort(input: {
  db: GrowthDb;
  item: Item;
  destination: Destination;
  copy: PackageCopyInput;
  media?: Uint8Array | null;
  now?: Date;
  exceptJobId?: string;
}): Promise<ShortsGateResult> {
  const now = input.now ?? new Date();
  const measured = input.media ? mp4DurationSeconds(input.media) : null;
  const metadata = input.item.mediaDurationMs ? input.item.mediaDurationMs / 1000 : null;
  const durationSeconds = measured ?? metadata;
  const channel: ShortsChannelKind = channelKind(input.destination) === "kitchen" ? "kitchen" : "product";
  const script = input.item.copy.article?.body || input.item.summary || "";
  const titleVerdict = await judgeTitleWithModel({
    title: input.copy.title || input.item.title,
    script,
    language: input.item.language
  });
  return evaluateShortsGate({
    mode: "publish",
    title: input.copy.title || input.item.title,
    description: input.copy.body || "",
    script,
    captions: input.copy.body || "",
    language: input.item.language,
    durationSeconds,
    hashtags: input.copy.hashtags,
    channel,
    requireProductDemo: isReelminoProductChannel(input.destination),
    recent: recentChannelPosts(input.db, input.destination.id, now, input.exceptJobId),
    publishedToday: countShortsToday(input.db, input.destination.id, now, input.exceptJobId),
    dailyCap: readShortsDailyCap(input.db),
    titleVerdict
  });
}

function isReelminoProductChannel(destination: { externalId?: string | null; handle?: string | null; name?: string | null; url?: string | null }): boolean {
  const blob = `${destination.externalId ?? ""} ${destination.handle ?? ""} ${destination.name ?? ""} ${destination.url ?? ""}`;
  return blob.includes("UC3iee8PYICmnfO5s8viJgkQ") || /reelminoapp/i.test(blob);
}

function llmEnabled(): boolean {
  if (process.env.SHORTS_TITLE_LLM === "0") return false;
  if (process.env.SHORTS_TITLE_LLM === "1") return true;
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

async function gemini(system: string, user: string, fetchImpl: typeof fetch): Promise<string> {
  const model = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.0-flash";
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!.trim())}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" }
      })
    }
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const payload = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function openai(system: string, user: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY?.trim() ?? ""}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? "";
}

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("title judge returned no JSON");
  return raw.slice(start, end + 1);
}

function parseJson(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
