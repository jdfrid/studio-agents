/**
 * Estimate word-level karaoke timings from narration + scene window.
 * Durations are proportional to character length (good enough until ASR).
 */
export type KaraokeWordCue = {
  text: string;
  startSecond: number;
  endSecond: number;
};

export type KaraokeLineCue = {
  text: string;
  startSecond: number;
  endSecond: number;
  words: KaraokeWordCue[];
};

const MAX_CHARS_PER_LINE = 28;

/** Hebrew niqqud / cantillation marks — strip for on-screen captions (keep for TTS). */
export function stripNiqqud(text: string): string {
  return String(text ?? "").replace(/[\u0591-\u05C7]/g, "");
}

export function isRtlContentLanguage(language?: string | null): boolean {
  const lang = String(language ?? "").toLowerCase();
  return lang.startsWith("he") || lang.startsWith("ar") || lang.startsWith("yi") || lang.startsWith("fa");
}

export function splitNarrationWords(narration: string): string[] {
  return String(narration ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Pack words into short display lines (Hebrew-friendly char budget). */
export function packWordsIntoLines(words: string[], maxChars = MAX_CHARS_PER_LINE): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  let len = 0;
  for (const word of words) {
    const next = len + (current.length ? 1 : 0) + word.length;
    if (current.length && next > maxChars) {
      lines.push(current);
      current = [word];
      len = word.length;
    } else {
      current.push(word);
      len = next;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

export function buildKaraokeCues(
  narration: string,
  startSecond: number,
  endSecond: number,
  opts?: { forDisplay?: boolean }
): KaraokeLineCue[] {
  const source = opts?.forDisplay === false ? narration : stripNiqqud(narration);
  const words = splitNarrationWords(source);
  if (!words.length) return [];
  const duration = Math.max(0.4, endSecond - startSecond);
  const totalWeight = words.reduce((sum, w) => sum + Math.max(1, w.length), 0);
  let cursor = startSecond;
  const wordCues: KaraokeWordCue[] = words.map((text) => {
    const weight = Math.max(1, text.length);
    const slice = (weight / totalWeight) * duration;
    const start = cursor;
    const end = Math.min(endSecond, cursor + Math.max(0.12, slice));
    cursor = end;
    return { text, startSecond: start, endSecond: end };
  });
  if (wordCues.length) wordCues[wordCues.length - 1]!.endSecond = endSecond;

  const packed = packWordsIntoLines(words);
  const cues: KaraokeLineCue[] = [];
  let idx = 0;
  for (const lineWords of packed) {
    const slice = wordCues.slice(idx, idx + lineWords.length);
    idx += lineWords.length;
    if (!slice.length) continue;
    cues.push({
      text: lineWords.join(" "),
      startSecond: slice[0]!.startSecond,
      endSecond: slice[slice.length - 1]!.endSecond,
      words: slice
    });
  }
  return cues;
}

function assTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Build ASS with karaoke {\k} tags.
 * RTL (he/ar/yi): reverse word order for karaoke highlight + wrap with RLE so punctuation stays correct.
 */
export function buildKaraokeAss(
  lines: KaraokeLineCue[],
  opts?: { fontName?: string; rtl?: boolean; language?: string | null }
): string {
  const font = opts?.fontName ?? "Arial";
  const rtl = opts?.rtl ?? isRtlContentLanguage(opts?.language);
  const header = `[Script Info]
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${font},52,&H00FFFFFF,&H00E07020,&H80000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const RLE = "\u202B";
  const PDF = "\u202C";

  const events = lines
    .map((line) => {
      // Keep speaking order for {\k}; RLE places the first spoken word on the right for he/ar.
      const kText = line.words
        .map((w) => {
          const durCs = Math.max(1, Math.round((w.endSecond - w.startSecond) * 100));
          return `{\\k${durCs}}${escapeAss(w.text)}`;
        })
        .join(rtl ? "" : " ");
      const body = rtl ? `${RLE}${kText}${PDF}` : kText;
      return `Dialogue: 0,${assTime(line.startSecond)},${assTime(line.endSecond)},Karaoke,,0,0,0,,${body}`;
    })
    .join("\n");

  return `${header}${events}\n`;
}

/** Simple centered title card ASS (avoids fragile drawtext -vf chains). */
export function buildTitleCardAss(
  input: { headline: string; subtitle?: string; durationSeconds: number; width: number; height: number },
  opts?: { fontName?: string; rtl?: boolean }
): string {
  const font = opts?.fontName ?? "Arial";
  const dur = Math.max(1, input.durationSeconds);
  const rtl = Boolean(opts?.rtl);
  const RLE = "\u202B";
  const PDF = "\u202C";
  const wrap = (t: string) => (rtl ? `${RLE}${t}${PDF}` : t);
  const headline = wrap(escapeAss(input.headline.trim() || " "));
  const subtitle = input.subtitle?.trim() ? wrap(escapeAss(input.subtitle.trim())) : "";
  const titleSize = Math.max(36, Math.round(Math.min(input.width, input.height) * 0.07));
  const subSize = Math.max(22, Math.round(Math.min(input.width, input.height) * 0.038));
  return `[Script Info]
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${input.width}
PlayResY: ${input.height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,${font},${titleSize},&H00FFFFFF,&H00FFFFFF,&H80000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,2,48,48,${Math.round(input.height * 0.42)},1
Style: Sub,${font},${subSize},&H00E6E6E6,&H00FFFFFF,&H80000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,48,48,${Math.round(input.height * 0.52)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${assTime(0)},${assTime(dur)},Title,,0,0,0,,${headline}
${subtitle ? `Dialogue: 0,${assTime(0.15)},${assTime(dur)},Sub,,0,0,0,,${subtitle}\n` : ""}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");
}

export function creativeFlagOn(
  creative: { karaokeCaptions?: string; sideWatermark?: string; preferHeygenDub?: string } | null | undefined,
  key: "karaokeCaptions" | "sideWatermark" | "preferHeygenDub",
  defaultOn = false
): boolean {
  const v = creative?.[key];
  if (v === "on") return true;
  if (v === "off") return false;
  return defaultOn;
}
