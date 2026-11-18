/**
 * Shorts growth template and the checks that decide whether a Short may publish.
 * Channel copy (kitchen vs product) lives here so the growth console and the
 * script/audio agents follow the same rules.
 */

export const SHORTS_TARGET_SECONDS = 20;
export const SHORTS_MIN_SECONDS = 15;
export const SHORTS_HARD_MAX_SECONDS = 25;
export const SHORTS_DEFAULT_DAILY_CAP = 3;
export const SHORTS_DUPLICATE_DAYS = 14;
export const PRODUCT_FEATURE_WINDOW_DAYS = 7;
export const PRODUCT_DEMO_CTA = "Try it with your sentence - link in pinned comment.";
export const SHORTS_TITLE_MAX = 60;

export type ShortsChannelKind = "kitchen" | "product";
export type ShortsGateMode = "plan" | "publish";
export type ShortsGateDecision = "publish" | "block" | "review";

export type SeriesTopic = {
  id: string;
  weight: number;
  titles: { en: string; he: string };
  hooks: { en: string; he: string };
  angles: { en: string[]; he: string[] };
};

export type ShortsGateInput = {
  mode?: ShortsGateMode;
  title: string;
  description: string;
  script: string;
  captions?: string;
  language: string;
  durationSeconds?: number | null;
  hashtags?: string[];
  recent?: Array<{ title: string; script?: string; featureId?: string; businessId?: string; publishedAt?: string }>;
  publishedToday?: number;
  dailyCap?: number;
  channel?: ShortsChannelKind;
  /** Product-channel feature demo rules. Kitchen and other channels leave this off. */
  requireProductDemo?: boolean;
  /** Optional model verdict. The offline overlap check runs when this is omitted. */
  titleVerdict?: { matches: boolean; reason: string } | null;
};

export type ShortsGateResult = {
  decision: ShortsGateDecision;
  code: "ok" | "shorts_quality" | "shorts_review" | "shorts_daily_cap";
  reasons: string[];
  title: string;
  description: string;
  hashtags: string[];
};

const HEBREW = /\p{Script=Hebrew}/gu;
const LATIN = /\p{Script=Latin}/gu;

const GENERIC_TITLES = [
  "what matters now",
  "מה כדאי לדעת עכשיו",
  "untitled",
  "new video",
  "watch this",
  "shorts",
  "video",
  "סרטון",
  "סרטון חדש"
];

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with", "your", "you", "this", "that",
  "from", "into", "its", "it's", "is", "are", "was", "were", "be", "it", "as", "at", "by", "we", "our",
  "but", "if", "so", "not", "just", "get", "one", "how", "what", "why", "when", "who", "keep", "save",
  "now", "more", "than", "then", "them", "they", "can", "out", "day", "days", "make", "made", "video",
  "shorts", "matter", "matters", "wooden", "using", "used", "use", "new", "watch", "this", "stop",
  "של", "את", "על", "עם", "זה", "זו", "לא", "גם", "כל", "או", "אם", "יש", "מה", "איך", "למה", "אני",
  "הוא", "היא", "הם", "בין", "עוד", "רק", "אבל", "אז", "כדי", "אחד", "הזה", "הזאת", "כי"
]);

const LEAK =
  /אשה מדברת|אישה מדברת|בסגנון קליל|vertical video that follows the saved script|what matters now|user demands win|do not copy another creator|source material only|approvalmode|veoprompt|system instruction|return strictly valid json|הטקסט הבא הוא חומר גלם|בלי להשאיר את הניסוח|write a (?:title|script|description)|mandatory — do not/i;

const INTRO =
  /^(?:hey|hi|hello|welcome|what'?s up|good morning|hey guys|hi everyone|hi friends|friends)\b|^(?:שלום|היי|הי|ברוכים|היום נדבר|בסרטון הזה|צופים יקרים)|visit our website|click subscribe|link in bio|check the (?:link|description)|בקרו באתר|לחצו על הצטרפות|לחץ על הצטרפות|^logo\b/i;

export const KITCHEN_TOPICS: SeriesTopic[] = [
  {
    id: "herbs",
    weight: 5,
    titles: { en: "How to keep fresh herbs alive for weeks", he: "איך שומרים על עשבי תיבול טריים שבועות" },
    hooks: {
      en: "Stop letting your fresh herbs turn into slimy green mush in the fridge.",
      he: "תפסיקו לתת לעשבי התיבול להפוך לעיסה ירוקה במקרר."
    },
    angles: {
      en: ["Stand the stems in a glass of water and cover them loosely.", "Wrap the roots in a dry towel and skip the sealed bag."],
      he: ["מעמידים את הגבעולים בכוס מים ומכסים ברפיון.", "עוטפים את השורשים במגבת יבשה בלי שקית אטומה."]
    }
  },
  {
    id: "produce",
    weight: 5,
    titles: { en: "How to keep fresh produce crisp longer", he: "איך שומרים על ירקות פריכים יותר זמן" },
    hooks: {
      en: "Your lettuce dies in three days because the drawer is a swamp.",
      he: "החסה מתה תוך שלושה ימים כי המגירה רטובה מדי."
    },
    angles: {
      en: ["Dry the leaves, then line the drawer with a towel.", "Keep ethylene fruit out of the crisper."],
      he: ["מייבשים את העלים ומרפדים את המגירה במגבת.", "מוציאים פירות שמזרזים הבשלה מהמגירה."]
    }
  },
  {
    id: "storage",
    weight: 4,
    titles: { en: "How to store leftovers so they stay fresh", he: "איך מאחסנים שאריות כדי שיישארו טריות" },
    hooks: {
      en: "Stop stacking hot leftovers in one deep container.",
      he: "תפסיקו לדחוס שאריות חמות לקופסה אחת עמוקה."
    },
    angles: {
      en: ["Cool in a shallow box, then label the day.", "Leave one corner unsealed until the steam is gone."],
      he: ["מצננים בקופסה שטוחה ורושמים את היום.", "משאירים פינה פתוחה עד שהאדים יוצאים."]
    }
  },
  {
    id: "fridge-layout",
    weight: 4,
    titles: { en: "Where food should go in the fridge", he: "איפה כל אוכל צריך לעמוד במקרר" },
    hooks: {
      en: "Your leftovers spoil because they are on the wrong shelf.",
      he: "השאריות מתקלקלות כי הן במדף הלא נכון."
    },
    angles: {
      en: ["Ready food on top, raw meat at the bottom.", "The door is for sauces, not for milk."],
      he: ["אוכל מוכן למעלה, בשר נא למטה.", "הדלת היא לרטבים, לא לחלב."]
    }
  },
  {
    id: "kitchen-layout",
    weight: 3,
    titles: { en: "How to set up a small kitchen that works", he: "איך מסדרים מטבח קטן שעובד" },
    hooks: {
      en: "Your counter is crowded because the tools you use daily are in the back.",
      he: "השיש עמוס כי הכלים של כל יום נדחפו לאחור."
    },
    angles: {
      en: ["Keep the daily pan between the sink and the stove.", "Hang the three tools you actually reach for."],
      he: ["משאירים את המחבת היומית בין הכיור לכיריים.", "תולים את שלושת הכלים שבאמת שולפים."]
    }
  }
];

export type ProductFeature = {
  id: string;
  weight: number;
  name: string;
  aliases: string[];
  title: string;
};

export type ProductBusiness = {
  id: string;
  label: string;
  prompt: string;
};

export const PRODUCT_FEATURES: ProductFeature[] = [
  { id: "branding", weight: 5, name: "automatic branding", aliases: ["automatic branding", "brand colors"], title: "Brand a {business} video from a logo" },
  { id: "one-sentence", weight: 5, name: "one sentence to full video", aliases: ["one sentence to full video", "one sentence"], title: "Turn one sentence into a {business} video" },
  { id: "aspect", weight: 4, name: "aspect-ratio switch", aliases: ["aspect-ratio switch", "aspect ratio"], title: "A {business} video in 9:16 and 16:9" },
  { id: "multilingual", weight: 4, name: "multilingual voiceover", aliases: ["multilingual voiceover", "several languages"], title: "A {business} video in several languages" },
  { id: "templates", weight: 4, name: "business templates", aliases: ["business templates", "business template"], title: "A {business} video template from one line" },
  { id: "before-after", weight: 3, name: "before and after", aliases: ["before and after", "plain text"], title: "Plain text versus a finished {business} video" },
  { id: "speed", weight: 5, name: "sixty second ad", aliases: ["60 seconds", "sixty second"], title: "AI video ad for a {business} in 60 seconds" }
];

export const PRODUCT_BUSINESSES: ProductBusiness[] = [
  { id: "bakery", label: "bakery", prompt: "Bakery in Tel Aviv, weekend sale 20% off." },
  { id: "restaurant", label: "restaurant", prompt: "Family restaurant, Tuesday pasta night, kids eat free." },
  { id: "real-estate", label: "real estate", prompt: "Two-bedroom apartment for sale, sea view, open house Sunday." },
  { id: "gym", label: "gym", prompt: "Neighborhood gym, first month half off for new members." },
  { id: "salon", label: "salon", prompt: "Hair salon, balayage special this week, book online." },
  { id: "ecommerce", label: "online shop", prompt: "Online shop, linen shirts, free shipping over fifty dollars." }
];

export type ProductDemo = {
  featureId: string;
  featureName: string;
  businessId: string;
  businessLabel: string;
  prompt: string;
  title: string;
  script: string;
  description: string;
  comment: string;
};

export const PRODUCT_TOPICS: SeriesTopic[] = PRODUCT_FEATURES.map((feature) => {
  const sample = PRODUCT_BUSINESSES[0]!;
  const title = feature.title.replace("{business}", sample.label);
  return {
    id: feature.id,
    weight: feature.weight,
    titles: { en: title, he: title },
    hooks: { en: sample.prompt, he: sample.prompt },
    angles: {
      en: [`Show ${feature.name} for a ${sample.label}.`],
      he: [`Show ${feature.name} for a ${sample.label}.`]
    }
  };
});

export function shortsNarrationRules(): string {
  return [
    "SHORTS GROWTH: the finished film is 15 to 20 seconds and must stay under 25 seconds, including the end card.",
    "Second 0 is the hook: a concrete problem or the finished visual result. No logo, no greeting, no welcome.",
    "One idea only. Two or three quick steps, each with a visible before and after.",
    "The last spoken line repeats the opening line so the video loops into itself.",
    "Do not say Visit our website, Click Subscribe, or read a URL.",
    "Every narration line is a complete sentence. Do not stop mid-sentence.",
    "Write the brand name exactly as Reelmino. Never spell a pronunciation in on-screen text."
  ].join(" ");
}

export function followCta(language: string): string {
  return language.toLowerCase().startsWith("he") ? "עקבו לטיפ אחד ביום" : "Follow for one fix a day";
}

export function productDemoComment(promptOrScript: string): string {
  const prompt = promptOrScript.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? promptOrScript.trim();
  return `${prompt}\nhttps://reelmino.com`;
}

export function buildProductDemo(feature: ProductFeature, business: ProductBusiness): ProductDemo {
  const title = fitTitle(feature.title.replaceAll("{business}", business.label));
  const prompt = business.prompt.endsWith(".") ? business.prompt : `${business.prompt}.`;
  const script = [
    prompt,
    `${title}.`,
    `Reelmino runs ${feature.name} for this ${business.label}.`,
    `The finished ${business.label} video plays with the brand on it.`,
    PRODUCT_DEMO_CTA,
    prompt
  ].join("\n");
  const description = [
    `${feature.name[0]?.toUpperCase()}${feature.name.slice(1)} for a ${business.label}: ${prompt}`,
    "https://reelmino.com",
    filterShortsHashtags([feature.id, business.id, business.label, "ai", "videoad"], "en").map((tag) => `#${tag}`).join(" ")
  ].join("\n\n");
  return {
    featureId: feature.id,
    featureName: feature.name,
    businessId: business.id,
    businessLabel: business.label,
    prompt,
    title,
    script,
    description,
    comment: productDemoComment(prompt)
  };
}

export function matchProductDemo(text: string): { featureId: string; businessId: string } | null {
  const haystack = text.toLowerCase();
  const feature = [...PRODUCT_FEATURES].sort((a, b) => longestAlias(b) - longestAlias(a)).find((item) =>
    item.aliases.some((alias) => haystack.includes(alias.toLowerCase()))
  );
  const business = PRODUCT_BUSINESSES.find((item) => haystack.includes(item.label.toLowerCase()) || haystack.includes(item.prompt.toLowerCase().replace(/\.$/, "")));
  if (!feature || !business) return null;
  return { featureId: feature.id, businessId: business.id };
}

export function nextProductDemo(input: {
  recent: Array<{ featureId?: string; businessId?: string; title?: string; script?: string }>;
  salt?: number;
  multipliers?: Record<string, number>;
}): ProductDemo | null {
  const recentPairs = input.recent.map((item) => item.featureId && item.businessId
    ? { featureId: item.featureId, businessId: item.businessId }
    : matchProductDemo(`${item.title ?? ""}\n${item.script ?? ""}`)).filter((item): item is { featureId: string; businessId: string } => Boolean(item));
  const last = recentPairs[0];
  const ranked = [...PRODUCT_FEATURES]
    .map((feature) => ({ ...feature, weight: feature.weight * boundedMultiplier(input.multipliers?.[feature.id]) }))
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  const features = ranked.filter((feature) => feature.id !== last?.featureId);
  const pool = features.length ? features : ranked;
  for (const feature of pool) {
    const businesses = PRODUCT_BUSINESSES.filter((business) => {
      if (business.id === last?.businessId) return false;
      return !recentPairs.some((pair) => pair.featureId === feature.id && pair.businessId === business.id);
    });
    const choices = businesses.length ? businesses : PRODUCT_BUSINESSES.filter((business) => business.id !== last?.businessId);
    if (!choices.length) continue;
    const business = choices[(input.salt ?? 0) % choices.length] ?? choices[0];
    if (!business) continue;
    const demo = buildProductDemo(feature, business);
    if (demo.title.length > SHORTS_TITLE_MAX) continue;
    return demo;
  }
  return null;
}

function longestAlias(feature: ProductFeature): number {
  return feature.aliases.reduce((max, alias) => Math.max(max, alias.length), 0);
}

function boundedMultiplier(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.5, value));
}

/** Map the old 30-second short option onto the 20-second target. Longer cuts stay as chosen. */
export function shortsBriefSeconds(requestedSeconds: number): number {
  if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 30) return SHORTS_TARGET_SECONDS;
  return Math.round(requestedSeconds);
}

export function shortsChannelTopics(kind: ShortsChannelKind): SeriesTopic[] {
  return kind === "kitchen" ? KITCHEN_TOPICS : PRODUCT_TOPICS;
}

export function textMatchesLanguage(text: string, language: string): boolean {
  const stripped = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/#shorts\b/gi, " ")
    .replace(/\b(?:reelmino|rihlmeenoh)\b/gi, " ")
    .replace(/רילמינו/g, " ");
  const hebrew = stripped.match(HEBREW)?.length ?? 0;
  const latin = stripped.match(LATIN)?.length ?? 0;
  if (hebrew + latin === 0) return true;
  if (language.toLowerCase().startsWith("he")) return hebrew > 0 && hebrew >= latin;
  return latin > 0 && latin > hebrew;
}

export function fitTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= SHORTS_TITLE_MAX) return clean;
  const cut = clean.slice(0, SHORTS_TITLE_MAX + 1);
  const space = cut.lastIndexOf(" ");
  const fitted = (space >= 12 ? cut.slice(0, space) : clean.slice(0, SHORTS_TITLE_MAX)).trim();
  return fitted.replace(/[\s,.:;|-]+$/g, "");
}

export function isGenericTitle(title: string): boolean {
  const key = title.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return true;
  return GENERIC_TITLES.some((banned) => key === banned || key.startsWith(`${banned} `));
}

export function promptLeakSpans(text: string): string[] {
  const found = text.match(LEAK);
  return found?.[0] ? [found[0]] : [];
}

export function wordsOf(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    if (raw.length < 3 || STOP.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export function filterShortsHashtags(tags: string[], language: string, options?: { shorts?: boolean }): string[] {
  const hebrew = language.toLowerCase().startsWith("he");
  const seen = new Set<string>();
  const out: string[] = [];
  if (options?.shorts !== false) {
    out.push("shorts");
    seen.add("shorts");
  }
  for (const raw of tags) {
    const tag = raw.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").trim();
    if (tag.length < 3) continue;
    const key = tag.toLowerCase();
    if (STOP.has(key) || seen.has(key)) continue;
    const tagHebrew = /\p{Script=Hebrew}/u.test(tag);
    const tagLatin = /[A-Za-z]/.test(tag);
    if (hebrew && tagLatin && !tagHebrew) continue;
    if (!hebrew && tagHebrew) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 5) break;
  }
  return out;
}

export function applyPronunciationLexicon(text: string, language: string): string {
  const spoken = language.toLowerCase().startsWith("he") ? "רילמינו" : "Rihlmeenoh";
  return text.replace(/\b(?:reel|real)[\s-]?mino\b(?!\.\w)/gi, spoken);
}

export function pronunciationStyleNote(): string {
  return 'Pronounce Rihlmeenoh as one word, stress on "mee". Never say "real mino" or "reel mino".';
}

export function withPronunciation(text: string, language: string): { text: string; style: string } {
  const next = applyPronunciationLexicon(text, language);
  const branded = next !== text || /rihlmeenoh|רילמינו/i.test(next);
  return { text: next, style: branded ? pronunciationStyleNote() : "" };
}

export function narrationFromScriptJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { scenes?: Array<{ narration?: unknown }> };
    return (parsed.scenes ?? [])
      .map((scene) => (typeof scene?.narration === "string" ? scene.narration.trim() : ""))
      .filter((line) => line.length > 0)
      .join("\n");
  } catch {
    return "";
  }
}

export function looksLikeNarration(text: string): boolean {
  const body = text.trim();
  if (!body) return false;
  if (body.length >= 40) return true;
  if (/[.!?]/.test(body) && body.length >= 12) return true;
  const lines = body.split(/\n+/).filter((line) => line.trim());
  return lines.length >= 2 && body.length >= 24;
}

export function contentSentences(text: string, language: string, limit = 2): string[] {
  const chunks = text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8 && !LEAK.test(part) && !/vertical video that follows/i.test(part));
  const matched = chunks.filter((part) => textMatchesLanguage(part, language));
  return matched.slice(0, limit).map((part) => (/[.!?]$/.test(part) ? part : `${part}.`));
}

export function shortsDescription(input: {
  title: string;
  script: string;
  language: string;
  kind: ShortsChannelKind;
  hashtags?: string[];
}): string {
  const sentences = [
    ...contentSentences(input.script, input.language, 2),
    ...contentSentences(input.title, input.language, 1)
  ].slice(0, 2);
  const hebrew = input.language.toLowerCase().startsWith("he");
  const fallback = hebrew ? "טיפ אחד שאפשר ליישם היום." : "One fix you can use today.";
  const body = sentences.length ? sentences.join(" ") : fallback;
  const closer =
    input.kind === "kitchen"
      ? hebrew
        ? "נוצר עם Reelmino."
        : "Made with Reelmino."
      : hebrew
        ? "Reelmino הופך משפט אחד לסרטון ממותג.\nhttps://reelmino.com"
        : "Reelmino turns one sentence into a branded video.\nhttps://reelmino.com";
  const tags = filterShortsHashtags(input.hashtags ?? wordsOf(`${input.title} ${sentences.join(" ")}`), input.language).map(
    (tag) => `#${tag}`
  );
  return `${body}\n\n${closer}\n\n${tags.join(" ")}`.trim();
}

export function shortsProductionNotes(input: {
  kind: ShortsChannelKind;
  language: string;
  hook?: string;
  angle?: string;
}): string {
  const hebrew = input.language.toLowerCase().startsWith("he");
  const cta = followCta(input.language);
  const shape = hebrew
    ? `אורך היעד 15 עד 20 שניות, ולא יותר מ-25. השנייה הראשונה היא בעיה מוחשית או התוצאה על המסך, בלי לוגו ובלי שלום. רעיון אחד בלבד, שניים או שלושה צעדים עם לפני ואחרי. השורה המדוברת האחרונה חוזרת על שורת הפתיחה כדי שהסרטון יתחיל מחדש. לא אומרים לבקר באתר ולא קוראים כתובת. כל משפט שלם. קריאה לפעולה, אם יש, קצרה מ-2 שניות: ${cta}.`
    : `Target length is 15 to 20 seconds, hard maximum 25. Second 0 is a concrete problem or the finished result on screen. No logo and no greeting. One idea only, two or three steps with a before and after. The last spoken line repeats the opening line so the video loops. Do not say visit our website and do not read a URL. Every sentence is complete. An optional call to action is under 2 seconds: ${cta}.`;
  const channel = input.kind === "kitchen"
    ? hebrew
      ? "פתיח למטבח: תפסיקו ואז התוצאה הרעה, או שהמוצר מת תוך כמה ימים כי."
      : "Kitchen hook: Stop, then the bad outcome, or Your item dies in a few days because."
    : hebrew
      ? "פתיח למוצר: קודם המודעה המוכנה או הדמות המדברת, ואז הכנתי את זה ממשפט אחד."
      : "Product demo: 0-1.5s show the exact one sentence being typed, bold text, no logo and no greeting. 1.5-8s a fast Reelmino screen, progress and branding. 8-17s the finished business video. Last 2s say exactly: Try it with your sentence - link in pinned comment. Then cut back to the prompt so it loops. Name the feature and one real business. No trailers and no third-party characters.";
  const given = [
    input.hook ? (hebrew ? `שורת הפתיחה המדוברת: ${input.hook}` : `Spoken opening line: ${input.hook}`) : "",
    input.angle ? (hebrew ? `הזווית החדשה: ${input.angle}` : `New angle: ${input.angle}`) : ""
  ].filter(Boolean);
  return [shape, channel, ...given].join(" ");
}

export function nextSeriesTopic(input: {
  kind: ShortsChannelKind;
  language: string;
  recentTitles: string[];
  salt?: number;
  multipliers?: Record<string, number>;
}): { id: string; title: string; hook: string; angle: string } | null {
  const hebrew = input.language.toLowerCase().startsWith("he");
  const lang = hebrew ? "he" : "en";
  const ranked = [...shortsChannelTopics(input.kind)]
    .map((topic) => ({ ...topic, weight: topic.weight * boundedMultiplier(input.multipliers?.[topic.id]) }))
    .sort((a, b) => b.weight - a.weight);
  const fresh = ranked.find((topic) => {
    const title = topic.titles[lang];
    return !input.recentTitles.some((recent) => tokenSimilarity(title, recent) >= 0.6);
  });
  if (!fresh) return null;
  const angles = fresh.angles[lang];
  const angle = angles[(input.salt ?? input.recentTitles.length) % angles.length] ?? angles[0] ?? "";
  return { id: fresh.id, title: fresh.titles[lang], hook: fresh.hooks[lang], angle };
}

export function tokenSimilarity(left: string, right: string): number {
  const a = new Set(wordsOf(left));
  const b = new Set(wordsOf(right));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

export function titleOverlap(title: string, content: string): number {
  const titleWords = wordsOf(title);
  if (!titleWords.length) return 0;
  const body = new Set(wordsOf(content));
  const shared = titleWords.filter((word) => body.has(word)).length;
  return shared / titleWords.length;
}

export function isNearDuplicate(input: {
  title: string;
  script: string;
  recent: Array<{ title: string; script?: string }>;
}): { match: boolean; title: string } {
  const titleKey = normalize(input.title);
  for (const recent of input.recent) {
    const recentTitle = recent.title?.trim() ?? "";
    if (!recentTitle) continue;
    if (titleKey && titleKey === normalize(recentTitle)) return { match: true, title: recentTitle };
    const titleScore = tokenSimilarity(input.title, recentTitle);
    const scriptScore = input.script && recent.script ? tokenSimilarity(input.script, recent.script) : 0;
    if (titleScore >= 0.82) return { match: true, title: recentTitle };
    if (scriptScore >= 0.75) return { match: true, title: recentTitle };
    if (titleScore >= 0.6 && scriptScore >= 0.62) return { match: true, title: recentTitle };
  }
  return { match: false, title: "" };
}

export function openingProblem(script: string): "ok" | "missing" | "intro" {
  const first = script
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) return "missing";
  if (INTRO.test(first) || LEAK.test(first)) return "intro";
  return "ok";
}

export function incompleteLines(script: string): string[] {
  if (!looksLikeNarration(script)) return [];
  const bad: string[] = [];
  for (const raw of script.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/[.!?…]["'״”)]?$/.test(line)) continue;
    if (line.length < 24 && /[.!?]/.test(line)) continue;
    bad.push(line.slice(0, 80));
  }
  return bad;
}

export function evaluateShortsGate(input: ShortsGateInput): ShortsGateResult {
  const mode = input.mode ?? "publish";
  const language = input.language || "en";
  const channel = input.channel ?? "product";
  const title = fitTitle(input.title || "");
  const script = (input.script || "").trim();
  const description = (input.description || "").trim();
  const captions = (input.captions || "").trim();
  const seconds = input.durationSeconds;
  const shortForm = seconds == null || seconds <= 60;
  const hashtags = filterShortsHashtags(
    [...(input.hashtags ?? []), ...wordsOf(`${title} ${script}`)],
    language,
    { shorts: shortForm }
  );
  const reasons: string[] = [];
  const publishedToday = input.publishedToday ?? 0;
  const dailyCap = input.dailyCap ?? SHORTS_DEFAULT_DAILY_CAP;

  if (publishedToday >= dailyCap) {
    return finish("block", "shorts_daily_cap", [
      `Daily cap reached (${publishedToday}/${dailyCap} Shorts on this channel today).`
    ], title, description, hashtags, language, channel, script, shortForm);
  }

  if (title.length < 2) reasons.push("Title is empty.");
  else if (isGenericTitle(title)) reasons.push(`Title is generic and does not describe the video: ${title}.`);
  if (title.length > SHORTS_TITLE_MAX) reasons.push("Title is longer than 60 characters.");
  const leaks = unique([
    ...promptLeakSpans(title),
    ...promptLeakSpans(description),
    ...promptLeakSpans(captions),
    ...promptLeakSpans(script)
  ]);
  if (leaks[0]) reasons.push(`Prompt or instruction text leaked into the post: ${leaks[0]}.`);
  if (title && !textMatchesLanguage(title, language)) reasons.push("Title language does not match the audio language.");
  if (description && !listingLanguageOk(description, language)) {
    reasons.push("Description language does not match the audio language.");
  }
  const duplicate = isNearDuplicate({ title, script, recent: input.recent ?? [] });
  if (duplicate.match) reasons.push(`Near-duplicate of a Short from the last 14 days: ${duplicate.title}.`);
  if (input.requireProductDemo && script) {
    const named = PRODUCT_FEATURES.some((feature) => feature.aliases.some((alias) => script.toLowerCase().includes(alias.toLowerCase())));
    const business = PRODUCT_BUSINESSES.some((item) => script.toLowerCase().includes(item.label.toLowerCase()));
    if (!named) reasons.push("Script does not name a product feature.");
    if (!business) reasons.push("Script has no concrete business example.");
    if (!/try it with your sentence/i.test(script) || !/pinned comment/i.test(script)) {
      reasons.push("Script is missing the pinned-comment call to action.");
    }
    const featurePair = matchProductDemo(script);
    const pairDuplicate = featurePair
      ? (input.recent ?? []).find((item) => {
          const matched = item.featureId && item.businessId
            ? { featureId: item.featureId, businessId: item.businessId }
            : matchProductDemo(`${item.title}\n${item.script ?? ""}`);
          if (!matched || matched.featureId !== featurePair.featureId || matched.businessId !== featurePair.businessId) return false;
          if (!item.publishedAt) return true;
          const age = Date.now() - Date.parse(item.publishedAt);
          return Number.isFinite(age) && age >= 0 && age <= PRODUCT_FEATURE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        })
      : undefined;
    if (pairDuplicate) reasons.push(`Same feature and business type in the last 7 days: ${pairDuplicate.title}.`);
  }

  let review = "";
  if (input.titleVerdict) {
    if (!input.titleVerdict.matches) reasons.push(`Title does not match the video: ${input.titleVerdict.reason}.`);
  } else if (script && wordsOf(script).length >= 4) {
    const overlap = titleOverlap(title, script);
    if (overlap < 0.2) reasons.push("Title does not describe the script.");
    else if (overlap < 0.34) review = "Title only partly matches the script and needs a look before it publishes.";
  }

  if (shortForm && looksLikeNarration(script)) {
    if (openingProblem(script) !== "ok") {
      reasons.push("The opening is a greeting, logo, or website pitch. Start on the problem or the result.");
    }
    const broken = incompleteLines(script);
    if (broken[0]) reasons.push(`A sentence is cut off: ${broken[0]}.`);
  }
  if (mode === "publish" && shortForm && seconds != null && Number.isFinite(seconds) && seconds > 0) {
    if (seconds > SHORTS_HARD_MAX_SECONDS + 0.4) {
      reasons.push(`Duration ${trimSeconds(seconds)}s is over the 25 second maximum.`);
    } else if (seconds < 8) {
      reasons.push(`Duration ${trimSeconds(seconds)}s is too short to be a complete Short.`);
    }
  }

  if (reasons.length) {
    return finish("block", "shorts_quality", reasons, title, description, hashtags, language, channel, script, shortForm);
  }
  if (review) {
    return finish("review", "shorts_review", [`Needs approval: ${review}`], title, description, hashtags, language, channel, script, shortForm);
  }
  return finish("publish", "ok", [], title, description, hashtags, language, channel, script, shortForm);
}

function finish(
  decision: ShortsGateDecision,
  code: ShortsGateResult["code"],
  reasons: string[],
  title: string,
  description: string,
  hashtags: string[],
  language: string,
  channel: ShortsChannelKind,
  script: string,
  shortForm: boolean
): ShortsGateResult {
  const cleaned = decision === "block" || !shortForm
    ? description
    : shortsDescription({ title, script: script || description, language, kind: channel, hashtags });
  return { decision, code, reasons, title, description: cleaned, hashtags };
}

function listingLanguageOk(description: string, language: string): boolean {
  const prose = description
    .replace(/#\S+/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(?:reelmino|rihlmeenoh)\b/gi, " ")
    .replace(/רילמינו/g, " ");
  return textMatchesLanguage(prose, language);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function trimSeconds(value: number): string {
  return String(Math.round(value * 10) / 10);
}
