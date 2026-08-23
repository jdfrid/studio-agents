import { ProviderError } from "@studio/shared";

export function veo429MaxAttempts(): number {
  const n = Number(process.env.GEMINI_VEO_429_MAX_ATTEMPTS ?? 8);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 20) : 8;
}

export function isGeminiRateLimitError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    const kind = error.metadata?.kind;
    if (kind === "rate_limit") return true;
    if (error.metadata?.status === 429) return true;
    const raw = String(error.metadata?.raw ?? "");
    if (/RESOURCE_EXHAUSTED|exceeded your current quota/i.test(raw)) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /(?:^|\D)429(?:\D|$)|RESOURCE_EXHAUSTED|rate.?limit|exceeded your current quota/i.test(message);
}

/** Delay after the Nth failed attempt (attempt starts at 1). Caps at 120s; honors Retry-After seconds. */
export function rateLimitRetryDelayMs(attempt: number, error?: unknown): number {
  const fromHeader = readRetryAfterMs(error);
  if (fromHeader != null) return fromHeader;
  const exp = Math.min(120_000, 15_000 * 2 ** Math.max(0, attempt - 1));
  return exp;
}

function readRetryAfterMs(error: unknown): number | null {
  if (!(error instanceof ProviderError)) return null;
  const ra = error.metadata?.retryAfter;
  if (typeof ra === "number" && Number.isFinite(ra) && ra > 0) {
    return Math.min(180_000, ra < 1000 ? ra * 1000 : ra);
  }
  if (typeof ra === "string" && ra.trim()) {
    const asNum = Number(ra.trim());
    if (Number.isFinite(asNum) && asNum > 0) {
      return Math.min(180_000, asNum < 1000 ? asNum * 1000 : asNum);
    }
  }
  return null;
}

export type RateLimitWaitInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  label: string;
};

export async function withGeminiRateLimitRetry<T>(
  label: string,
  fn: () => Promise<T>,
  onWait?: (info: RateLimitWaitInfo) => Promise<void> | void
): Promise<T> {
  const maxAttempts = veo429MaxAttempts();
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isGeminiRateLimitError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = rateLimitRetryDelayMs(attempt, error);
      await onWait?.({ attempt, maxAttempts, delayMs, label });
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
