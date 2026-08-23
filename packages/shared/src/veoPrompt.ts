/**
 * When voice/music are mixed via FFmpeg (not Veo native audio), Veo still fails if the
 * prompt asks for dialogue, lip motion, or soundtrack — Google's audio branch rejects
 * the whole clip ("Unable to create audio for your prompt").
 */
const AUDIO_CUE_RE =
  /\b(speak(?:s|ing)?|speech|dialogue|dialog|talk(?:s|ing)?|says?|said|voiceover|voice-over|narrat(?:e|es|ion|ing)|lip[-\s]?sync|mouth(?:s|ing)?\s+(?:the\s+)?words?|mouths?\s+the|sing(?:s|ing)?|soundtrack|background\s+music|bgm|audio\s+cue)\b/gi;

export function sanitizeVeoPromptForExternalAudio(prompt: string): string {
  const cleaned = prompt
    .replace(AUDIO_CUE_RE, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
  const base = cleaned || prompt.trim() || "Cinematic silent shot, natural motion";
  const suffix = "Silent video only: closed mouth, no dialogue, no music, no sound effects.";
  if (/silent video only/i.test(base)) return base.slice(0, 280);
  return `${base} ${suffix}`.slice(0, 280);
}
