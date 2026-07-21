/** Normalized Gemini usageMetadata from generateContent responses. */
export type GeminiUsageMetadata = {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  cachedContentTokenCount: number;
  thoughtsTokenCount: number;
  toolUsePromptTokenCount: number;
  /** Billable input tokens (prompt minus cached). */
  billableInputTokens: number;
  /** Billable output tokens (candidates + thoughts). */
  billableOutputTokens: number;
  raw: Record<string, unknown>;
};

export type CostPricingSource = "usage_metadata" | "estimate" | "request_params";

export type ModelTokenRates = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

const DEFAULT_RATES: ModelTokenRates = { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 };

/** Paid-tier $/MTok defaults — override via GEMINI_PRICING_JSON env. */
const MODEL_TOKEN_RATES: Array<{ match: RegExp; rates: ModelTokenRates }> = [
  { match: /gemini-3\.5-flash/i, rates: { inputUsdPerMillion: 1.5, outputUsdPerMillion: 9 } },
  { match: /gemini-3\.1-pro/i, rates: { inputUsdPerMillion: 2, outputUsdPerMillion: 12 } },
  { match: /gemini-3\.1-flash-lite/i, rates: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.5 } },
  { match: /gemini-3\.1-flash-image/i, rates: { inputUsdPerMillion: 0.5, outputUsdPerMillion: 3 } },
  { match: /gemini-3-flash/i, rates: { inputUsdPerMillion: 0.5, outputUsdPerMillion: 3 } },
  { match: /gemini-2\.5-pro/i, rates: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 } },
  { match: /gemini-2\.5-flash-preview-tts/i, rates: { inputUsdPerMillion: 0.5, outputUsdPerMillion: 10 } },
  { match: /gemini-2\.5-flash-lite/i, rates: { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 } },
  { match: /gemini-2\.5-flash/i, rates: { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 } },
  { match: /lyria/i, rates: { inputUsdPerMillion: 0.5, outputUsdPerMillion: 3 } }
];

let envPricingCache: Record<string, { input: number; output: number }> | null = null;

function loadEnvPricing(): Record<string, { input: number; output: number }> {
  if (envPricingCache) return envPricingCache;
  envPricingCache = {};
  const raw = process.env.GEMINI_PRICING_JSON?.trim();
  if (!raw) return envPricingCache;
  try {
    const parsed = JSON.parse(raw) as Record<string, { input?: number; output?: number }>;
    for (const [model, rates] of Object.entries(parsed)) {
      if (rates.input != null && rates.output != null) {
        envPricingCache[model.toLowerCase()] = { input: rates.input, output: rates.output };
      }
    }
  } catch {
    envPricingCache = {};
  }
  return envPricingCache;
}

export function tokenRatesForModel(model: string): ModelTokenRates {
  const env = loadEnvPricing();
  const envHit = env[model.toLowerCase()];
  if (envHit) {
    return { inputUsdPerMillion: envHit.input, outputUsdPerMillion: envHit.output };
  }
  for (const entry of MODEL_TOKEN_RATES) {
    if (entry.match.test(model)) return entry.rates;
  }
  return DEFAULT_RATES;
}

export function priceFromUsageMetadata(
  model: string,
  usage: GeminiUsageMetadata
): { usd: number; inputTokens: number; outputTokens: number } {
  const rates = tokenRatesForModel(model);
  const inputTokens = usage.billableInputTokens;
  const outputTokens = usage.billableOutputTokens;
  const usd =
    (inputTokens / 1_000_000) * rates.inputUsdPerMillion +
    (outputTokens / 1_000_000) * rates.outputUsdPerMillion;
  return { usd, inputTokens, outputTokens };
}

export function normalizeUsageMetadata(raw: Record<string, unknown>): GeminiUsageMetadata | null {
  const prompt = readCount(raw, "promptTokenCount", "prompt_token_count");
  const candidates = readCount(raw, "candidatesTokenCount", "candidates_token_count");
  const total = readCount(raw, "totalTokenCount", "total_token_count");
  const cached = readCount(raw, "cachedContentTokenCount", "cached_content_token_count");
  const thoughts = readCount(raw, "thoughtsTokenCount", "thoughts_token_count");
  const toolUse = readCount(raw, "toolUsePromptTokenCount", "tool_use_prompt_token_count");

  if (prompt === 0 && candidates === 0 && total === 0) return null;

  const billableInputTokens = Math.max(0, prompt - cached);
  const billableOutputTokens = candidates + thoughts;

  return {
    promptTokenCount: prompt,
    candidatesTokenCount: candidates,
    totalTokenCount: total || prompt + candidates + thoughts,
    cachedContentTokenCount: cached,
    thoughtsTokenCount: thoughts,
    toolUsePromptTokenCount: toolUse,
    billableInputTokens,
    billableOutputTokens,
    raw
  };
}

function readCount(obj: Record<string, unknown>, camel: string, snake: string): number {
  const v = obj[camel] ?? obj[snake];
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function pricingSourceLabel(source: CostPricingSource | undefined): string {
  switch (source) {
    case "usage_metadata":
      return "מדוד (tokens)";
    case "request_params":
      return "Veo params";
    case "estimate":
      return "משוער";
    default:
      return "—";
  }
}
