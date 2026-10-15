/**
 * Creem Moderation API (required by Creem for AI image/video products).
 * Every user-controlled text that can reach an image/video model must be screened first.
 * Policy: only "allow" passes; "flag" and "deny" block; any failure blocks (fail closed).
 */

import type { BriefInput } from "@studio/shared";

export type ModerationDecision = "allow" | "flag" | "deny";

export type ModerationOutcome = {
  decision: ModerationDecision;
  units: number;
  screenedChars: number;
  chunks: number;
};

export class ContentModerationError extends Error {
  constructor(
    readonly code: "prompt_rejected" | "moderation_unavailable",
    readonly decision: ModerationDecision | null,
    detail?: string
  ) {
    super(detail ?? code);
    this.name = "ContentModerationError";
  }
}

const MAX_CHUNK_CHARS = 4000;
const TIMEOUT_MS = 5000;

/** Moderation is enforced whenever a Creem key is configured. */
export function contentModerationEnabled(): boolean {
  return Boolean(process.env.CREEM_API_KEY?.trim());
}

function apiBase(key: string): string {
  return key.startsWith("creem_test_") ? "https://test-api.creem.io" : "https://api.creem.io";
}

/** Trims, drops empty and duplicate fragments, and joins them without any added boilerplate. */
export function moderationText(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const text = typeof part === "string" ? part.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    kept.push(text);
  }
  return kept.join("\n");
}

/** Splits long text into chunks on whitespace so very large payloads still get a real decision. */
export function moderationChunks(text: string, max = MAX_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function strictestDecision(decisions: ModerationDecision[]): ModerationDecision {
  if (decisions.includes("deny")) return "deny";
  if (decisions.includes("flag")) return "flag";
  return "allow";
}

async function screenChunk(
  key: string,
  prompt: string,
  externalId: string,
  fetchImpl: typeof fetch
): Promise<{ decision: ModerationDecision; units: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchImpl(`${apiBase(key)}/v1/moderation/prompt`, {
        method: "POST",
        headers: { "x-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ prompt, external_id: externalId }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (res.status >= 500) throw new Error(`moderation_http_${res.status}`);
      if (!res.ok) {
        throw new ContentModerationError("moderation_unavailable", null, `moderation_http_${res.status}`);
      }
      const json = (await res.json()) as { decision?: unknown; usage?: { units?: unknown } };
      const decision = json.decision;
      if (decision !== "allow" && decision !== "flag" && decision !== "deny") {
        throw new ContentModerationError("moderation_unavailable", null, "moderation_unknown_decision");
      }
      return { decision, units: Number(json.usage?.units ?? 0) || 0 };
    } catch (error) {
      if (error instanceof ContentModerationError) throw error;
      lastError = error;
    }
  }
  throw new ContentModerationError(
    "moderation_unavailable",
    null,
    lastError instanceof Error ? lastError.message : "moderation_failed"
  );
}

/**
 * Screens user-controlled text. Returns the outcome when allowed; throws ContentModerationError
 * on flag/deny or when Creem cannot be reached. No-op (allow) when moderation is not configured.
 */
export async function moderateUserText(
  parts: Array<string | null | undefined>,
  externalId: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<ModerationOutcome> {
  const text = moderationText(parts);
  const key = process.env.CREEM_API_KEY?.trim();
  if (!key || !text) return { decision: "allow", units: 0, screenedChars: 0, chunks: 0 };
  const chunks = moderationChunks(text);
  const results = await Promise.all(
    chunks.map((chunk) => screenChunk(key, chunk, externalId.slice(0, 200), options.fetchImpl ?? fetch))
  );
  const decision = strictestDecision(results.map((r) => r.decision));
  const outcome: ModerationOutcome = {
    decision,
    units: results.reduce((sum, r) => sum + r.units, 0),
    screenedChars: text.length,
    chunks: chunks.length
  };
  if (decision !== "allow") throw new ContentModerationError("prompt_rejected", decision);
  return outcome;
}

/** Free-text a user controls in a brief (catalog ids are cheap cached repeats, so screen them too). */
export function briefModerationParts(brief: BriefInput): string[] {
  return [
    brief.title,
    brief.sourceText,
    brief.instructions,
    brief.targetAudience,
    brief.style,
    brief.branding?.businessName,
    brief.branding?.slogan,
    ...stringLeaves(brief.creative ?? {}),
    ...(brief.creativeCatalogSnapshot ?? []).map((row) => (typeof row.value === "string" ? row.value : ""))
  ].filter((part): part is string => typeof part === "string");
}

/** All string leaves of a JSON value (used to screen only text a user edited). */
export function stringLeaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringLeaves(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) stringLeaves(item, out);
  return out;
}
