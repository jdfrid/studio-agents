/** Extract outermost JSON object from model text (strips fences and prose). */
export function extractJsonObjectSlice(raw: string): string {
  let trimmed = raw.trim();
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("no JSON object found");
  }
  return trimmed.slice(start, end + 1);
}

function normalizeJsonText(raw: string): string {
  return raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\r\n/g, "\n");
}

/** Remove trailing commas before } or ]. */
function stripTrailingCommas(json: string): string {
  let prev = "";
  let current = json;
  while (prev !== current) {
    prev = current;
    current = current.replace(/,\s*([}\]])/g, "$1");
  }
  return current;
}

/** Close truncated arrays/objects after dropping a partial trailing value. */
export function closeTruncatedJson(json: string): string {
  let attempt = stripTrailingCommas(normalizeJsonText(json.trim()));
  for (let i = 0; i < 24; i += 1) {
    try {
      JSON.parse(attempt);
      return attempt;
    } catch {
      /* continue repair */
    }
    attempt = attempt.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/s, "");
    attempt = attempt.replace(/,\s*"[^"]*"\s*:\s*[^,\]\}]+$/s, "");
    attempt = attempt.replace(/,\s*"[^"]*"\s*$/s, "");
    attempt = attempt.replace(/,\s*$/s, "");
    attempt = stripTrailingCommas(attempt);
    const openBrace = (attempt.match(/\{/g) ?? []).length - (attempt.match(/\}/g) ?? []).length;
    const openBracket = (attempt.match(/\[/g) ?? []).length - (attempt.match(/\]/g) ?? []).length;
    if (openBrace <= 0 && openBracket <= 0) break;
    attempt += "]".repeat(Math.max(0, openBracket));
    attempt += "}".repeat(Math.max(0, openBrace));
  }
  return attempt;
}

export function parseJsonObjectWithRepair<T>(raw: string): T {
  const slice = extractJsonObjectSlice(raw);
  const candidates = [
    slice,
    stripTrailingCommas(normalizeJsonText(slice)),
    closeTruncatedJson(slice)
  ];
  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("JSON parse failed");
}
