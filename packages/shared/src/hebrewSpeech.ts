import { stripNiqqud } from "./karaokeCaptions.js";

/** Dicta Nakdan — adds niqqud without being asked to rewrite the words. */
const NAKDAN_ENDPOINT = "https://nakdan-2-0.loadbalancer.dicta.org.il/api";

/** Hebrew letters only, so a vowel-point change cannot hide a rewritten word. */
export function hebrewLetterSkeleton(text: string): string {
  return stripNiqqud(text).replace(/[^\u05D0-\u05EA]/g, "");
}

type NakdanToken = {
  word?: unknown;
  sep?: unknown;
  options?: unknown;
};

/**
 * Point Hebrew for the speech engine. A token is kept only when its letters
 * match the original; any rewritten word stays unpointed. A failed request
 * returns the original unpointed text.
 */
export async function pointHebrewForSpeech(
  text: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> {
  const plain = stripNiqqud(text).trim();
  if (!/[\u05D0-\u05EA]/.test(plain)) return plain;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let response: Response;
    try {
      response = await fetchImpl(NAKDAN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          task: "nakdan",
          genre: "modern",
          data: plain,
          addmorph: false,
          keepqq: false,
          keepmetagim: true
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) return plain;
    const raw: unknown = await response.json();
    if (!Array.isArray(raw)) return plain;
    const pointed = raw.map((token) => pointedToken(token)).join("");
    if (!pointed.trim()) return plain;
    if (hebrewLetterSkeleton(pointed) !== hebrewLetterSkeleton(plain)) return plain;
    return pointed;
  } catch {
    return plain;
  }
}

function pointedToken(token: unknown): string {
  if (!token || typeof token !== "object") return "";
  const row = token as NakdanToken;
  const word = typeof row.word === "string" ? row.word : "";
  if (row.sep === true) return word;
  const top = Array.isArray(row.options) ? row.options.find((option) => typeof option === "string") : undefined;
  if (typeof top !== "string") return word;
  const vocalized = top.replace(/\|/g, "");
  if (hebrewLetterSkeleton(vocalized) !== hebrewLetterSkeleton(word)) return word;
  return vocalized;
}
