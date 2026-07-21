import { normalizeUsageMetadata, type GeminiUsageMetadata } from "@studio/shared";

export type { GeminiUsageMetadata };

/** Extract usageMetadata from a generateContent REST response (camelCase or snake_case). */
export function extractUsageMetadata(response: unknown): GeminiUsageMetadata | null {
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;
  const meta = (r.usageMetadata ?? r.usage_metadata) as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== "object") return null;
  return normalizeUsageMetadata(meta);
}
