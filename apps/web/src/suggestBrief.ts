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
  try {
    const last = window.localStorage.getItem("prompt2spot:content-language");
    if (last && ["en", "he", "ar", "ru", "fr", "es", "yi"].includes(last)) return last;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function storeContentLanguage(language: string): void {
  try {
    window.localStorage.setItem("prompt2spot:content-language", language);
  } catch {
    /* ignore */
  }
}
