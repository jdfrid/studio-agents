import { storageGet, storageSet } from "./brand/storage.js";

export function suggestTitleFromPrompt(prompt: string): string {
  const first = prompt.trim().split(/[\n.!?]/)[0]?.trim() ?? "";
  const source = first.length >= 2 ? first : prompt.trim();
  return source.slice(0, 80);
}

export function suggestGoalFromPrompt(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/מוצר|product|מכיר|sale|shop/.test(text)) return "product";
  if (/שירות|service/.test(text)) return "service";
  if (/מותג|brand|תדמית/.test(text)) return "brand";
  if (/הסבר|explainer|how to|איך/.test(text)) return "explainer";
  if (/אירוע|event|הזמנ/.test(text)) return "event";
  if (/רילס|טיקטוק|instagram|tiktok|social/.test(text)) return "social";
  return "social";
}

export function readStoredContentLanguage(fallback: string): string {
  const last = storageGet("reelmino:content-language", "prompt2spot:content-language");
  if (last && ["en", "he", "ar", "ru", "fr", "es", "yi"].includes(last)) return last;
  return fallback;
}

export function storeContentLanguage(language: string): void {
  storageSet("reelmino:content-language", language);
}
