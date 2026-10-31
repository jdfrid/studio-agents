export const PRESENTERS = ["woman", "man"] as const;
export const TONES = ["serious", "playful"] as const;

export type Presenter = (typeof PRESENTERS)[number];
export type Tone = (typeof TONES)[number];
export type Cast = { presenter: Presenter; tone: Tone };

export function castValue(value: string | null | undefined, allowed: readonly string[]): string {
  const cleaned = (value ?? "").trim().toLowerCase();
  return allowed.includes(cleaned) ? cleaned : "";
}

export function balancedPick<T extends string>(recent: string[], options: readonly T[], random: () => number = Math.random): T {
  const counts = new Map(options.map((option) => [option, 0]));
  for (const value of recent) {
    if (counts.has(value as T)) counts.set(value as T, (counts.get(value as T) ?? 0) + 1);
  }
  let min = Number.POSITIVE_INFINITY;
  for (const option of options) min = Math.min(min, counts.get(option) ?? 0);
  const least = options.filter((option) => (counts.get(option) ?? 0) === min);
  const index = Math.min(least.length - 1, Math.max(0, Math.floor(random() * least.length)));
  return least[index] ?? options[0];
}

export function resolveCast(input: {
  presenter?: string | null;
  tone?: string | null;
  recentPresenters: string[];
  recentTones: string[];
  random?: () => number;
}): Cast {
  const random = input.random ?? Math.random;
  return {
    presenter: input.presenter === "woman" || input.presenter === "man" ? input.presenter : balancedPick(input.recentPresenters, PRESENTERS, random),
    tone: input.tone === "serious" || input.tone === "playful" ? input.tone : balancedPick(input.recentTones, TONES, random)
  };
}

export function castInstruction(cast: Cast, language: string): string {
  const he = language.toLowerCase().startsWith("he");
  const person = cast.presenter === "woman"
    ? (he ? "על המסך מופיעה אישה." : "The on-screen presenter is a woman.")
    : (he ? "על המסך מופיע גבר." : "The on-screen presenter is a man.");
  const tone = cast.tone === "playful"
    ? (he ? "הטון קליל והיתולי." : "The tone is light and playful.")
    : (he ? "הטון רציני וענייני." : "The tone is serious and practical.");
  return `${person} ${tone}`;
}
