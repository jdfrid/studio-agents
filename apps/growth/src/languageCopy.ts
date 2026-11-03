const HEBREW = /\p{Script=Hebrew}/gu;
const LATIN = /\p{Script=Latin}/gu;

export function textMatchesLanguage(text: string, language: string): boolean {
  const hebrew = text.match(HEBREW)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (language.toLowerCase().startsWith("he")) return hebrew > 0 && hebrew >= latin;
  return latin > 0 && latin > hebrew;
}

export function titleInLanguage(source: string, language: string): string {
  const cleaned = source.replace(/[,\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (cleaned && textMatchesLanguage(cleaned, language)) return cleaned;
  return language.toLowerCase().startsWith("he") ? "מה כדאי לדעת עכשיו" : "What matters now";
}

/** On-screen and spoken subscribe line for the end of a YouTube video. */
export function subscribeCue(language: string): string {
  return language.toLowerCase().startsWith("he") ? "לחץ על הצטרפות לערוץ" : "Click Subscribe";
}

export function subscribeCueNote(language: string): string {
  const line = subscribeCue(language);
  return language.toLowerCase().startsWith("he")
    ? `בכרטיס הסיום מופיע על המסך ונאמר: ${line}. לא לשים את זה בפתיח.`
    : `The end card shows and says: ${line}. Do not put that in the opening.`;
}

export function languageLock(language: string): string {
  return language.toLowerCase().startsWith("he")
    ? "הכותרת, התיאור, הקריינות וכל טקסט על המסך בעברית בלבד. לא משאירים כותרת או תיאור בשפה אחרת."
    : "The title, the description, the narration, and every on-screen text must be in English only. Do not leave the title or the description in another language.";
}
