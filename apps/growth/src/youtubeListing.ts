import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PackageCopyInput } from "@studio/shared";
import type { ItemCopy } from "./copy.js";

/** New YouTube uploads stay private, then YouTube publishes them. */
export const YOUTUBE_PRIVATE_MS = 2 * 60 * 60 * 1000;

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with", "your", "you", "this", "that",
  "from", "into", "its", "it's", "is", "are", "was", "be", "it", "as", "at", "by", "we", "our", "but",
  "if", "so", "not", "just", "get", "one", "של", "את", "על", "עם", "זה", "לא", "גם", "כל", "או", "אם"
]);

export function youtubeReleaseAt(now = Date.now()): Date {
  return new Date(now + YOUTUBE_PRIVATE_MS);
}

function sameLanguage(word: string, hebrew: boolean): boolean {
  const he = /\p{Script=Hebrew}/u.test(word);
  const en = /[A-Za-z]/.test(word);
  if (hebrew) return he;
  return en && !he;
}

/** Words from the video text, in the selected language only. */
export function listingKeywords(text: string, language: string): string[] {
  const hebrew = language.toLowerCase().startsWith("he");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    const word = raw.trim();
    if (word.length < 3 || !sameLanguage(word, hebrew)) continue;
    const key = word.toLowerCase();
    if (STOP.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= 8) break;
  }
  return out;
}

function alreadyHook(title: string): boolean {
  return /[?!]|\d|→|—/.test(title) || /\b(how|why|stop|never|before|watch|this|you)\b/i.test(title);
}

/** A typed title stays. A flat generated title picks up a keyword from the video. */
export function clickTitle(input: { title: string; locked: boolean; language: string; keywords: string[] }): string {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title || input.locked || alreadyHook(title)) return title.slice(0, 100);
  const extra = input.keywords.find((word) => !title.toLowerCase().includes(word.toLowerCase()));
  const he = input.language.toLowerCase().startsWith("he");
  const next = extra ? (he ? `${title} — ${extra}` : `${title}: ${extra}`) : title;
  return next.replace(/\s+/g, " ").trim().slice(0, 100);
}

export function detailedDescription(input: {
  title: string;
  body: string;
  summary: string;
  sourceText: string;
  language: string;
}): { body: string; keywords: string[] } {
  const hebrew = input.language.toLowerCase().startsWith("he");
  const keywords = listingKeywords([input.title, input.summary, input.body, input.sourceText].join("\n"), input.language);
  let body = (input.body || input.summary || "").trim();
  const missing = keywords.filter((word) => !body.toLowerCase().includes(word.toLowerCase())).slice(0, 6);
  if (missing.length) {
    const line = hebrew ? `בסרטון: ${missing.join(", ")}.` : `In this video: ${missing.join(", ")}.`;
    body = body ? `${body}\n\n${line}` : line;
  }
  return { body: body.slice(0, 4500), keywords };
}

export function youtubeFileName(title: string, keywords: string[]): string {
  const extra = keywords.filter((word) => !title.toLowerCase().includes(word.toLowerCase())).slice(0, 4);
  const base = [title, ...extra]
    .join(" ")
    .replace(/[#<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  return `${base || "video"}.mp4`;
}

export function prepareYouTubeListing(
  item: { source: string; title: string; summary: string; language: string; copy: ItemCopy },
  copy: PackageCopyInput
): { copy: PackageCopyInput; keywords: string[] } {
  const sourceText = item.copy.article?.body || "";
  const described = detailedDescription({
    title: copy.title || item.title,
    body: copy.body || "",
    summary: item.summary || "",
    sourceText,
    language: item.language
  });
  const locked = item.source === "script-bank" || item.source === "kit";
  const title = clickTitle({
    title: copy.title || item.title,
    locked,
    language: item.language,
    keywords: described.keywords
  });
  return {
    keywords: described.keywords,
    copy: {
      ...copy,
      title,
      body: described.body,
      hashtags: [...(copy.hashtags ?? []), ...described.keywords]
    }
  };
}

/** The Reelmino mark, used as the YouTube thumbnail instead of a frame from the video. */
export function systemThumbnailBytes(): { body: Buffer; mimeType: string; filename: string } | null {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../brand/system-thumbnail.png");
  if (!existsSync(file)) return null;
  return { body: readFileSync(file), mimeType: "image/png", filename: "reelmino.png" };
}
