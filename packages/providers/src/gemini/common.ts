import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";

export interface GeminiModelConfig {
  text: string;
  tts: string;
  image: string;
  music: string;
  video: string;
}

export function geminiApiKey(provider?: ProviderCredentialView | null): string {
  const key = provider?.secret ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    throw new ProviderError("Gemini API key is missing. Configure ProviderCredential(type=GEMINI) or GEMINI_API_KEY.", {
      provider: "gemini"
    });
  }
  return key;
}

export function geminiBaseUrl(provider?: ProviderCredentialView | null): string {
  return String(provider?.config.baseUrl ?? process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta");
}

export function geminiModels(provider?: ProviderCredentialView | null): GeminiModelConfig {
  const models = (provider?.config.models ?? {}) as Partial<GeminiModelConfig>;
  return {
    text: String(models.text ?? provider?.config.textModel ?? "gemini-2.5-pro"),
    tts: String(models.tts ?? provider?.config.ttsModel ?? "gemini-2.5-flash-preview-tts"),
    image: String(models.image ?? provider?.config.imageModel ?? "gemini-3.1-flash-image"),
    music: String(models.music ?? provider?.config.musicModel ?? "lyria-3-clip-preview"),
    video: String(models.video ?? provider?.config.videoModel ?? "veo-3.1-generate-preview")
  };
}

export function isGeminiProvider(provider?: ProviderCredentialView | null): boolean {
  if (!provider) return false;
  return provider.type === "GEMINI" || provider.provider.toLowerCase().includes("gemini") || provider.provider.toLowerCase().includes("google");
}

export function geminiUrl(provider: ProviderCredentialView | null | undefined, path: string): string {
  const base = geminiBaseUrl(provider).replace(/\/+$/, "");
  const key = encodeURIComponent(geminiApiKey(provider));
  const sep = path.includes("?") ? "&" : "?";
  return `${base}/${path.replace(/^\/+/, "")}${sep}key=${key}`;
}

export function extractInlineData(
  response: unknown,
  preferredPrefix?: string
): { data: Buffer; mimeType: string } | null {
  const candidates = (response as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates ?? [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      const p = part as {
        inlineData?: { data?: string; mimeType?: string };
        inline_data?: { data?: string; mime_type?: string };
      };
      const camel = p.inlineData;
      const snake = p.inline_data;
      const inlineData = camel
        ? { data: camel.data, mimeType: camel.mimeType }
        : snake
          ? { data: snake.data, mimeType: snake.mime_type }
          : undefined;
      const data = inlineData?.data;
      const mimeType = inlineData?.mimeType ?? "application/octet-stream";
      if (data && (!preferredPrefix || mimeType.startsWith(preferredPrefix))) {
        return { data: Buffer.from(data, "base64"), mimeType };
      }
    }
  }
  return null;
}

export function extractText(response: unknown): string {
  const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates ?? [];
  return candidates.flatMap((c) => c.content?.parts?.map((p) => p.text ?? "") ?? []).join("").trim();
}

export function stablePromptHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export interface GeminiCapabilities {
  apiKeyConfigured: boolean;
  text: { available: boolean; model: string; reason?: string };
  tts: { available: boolean; model: string; reason?: string };
  image: { available: boolean; model: string; reason?: string };
  music: { available: boolean; model: string; reason?: string };
  video: { available: boolean; model: string; reason?: string };
}

export function checkGeminiCapabilities(provider: ProviderCredentialView | null): GeminiCapabilities {
  const models = geminiModels(provider);
  const apiKeyConfigured = Boolean(provider?.secret ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY);
  const configured = (provider?.config.capabilities ?? {}) as Record<string, boolean>;
  const musicAvailable = configured.music === true || process.env.GEMINI_LYRIA_ENABLED === "1";
  const missingKey = apiKeyConfigured ? undefined : "Gemini API key is not configured.";
  return {
    apiKeyConfigured,
    text: { available: apiKeyConfigured, model: models.text, reason: missingKey },
    tts: { available: apiKeyConfigured, model: models.tts, reason: missingKey },
    image: { available: apiKeyConfigured, model: models.image, reason: missingKey },
    music: {
      available: apiKeyConfigured && musicAvailable,
      model: models.music,
      reason: !apiKeyConfigured
        ? missingKey
        : musicAvailable
          ? undefined
          : "Lyria/music access must be explicitly enabled after account verification."
    },
    video: { available: apiKeyConfigured, model: models.video, reason: missingKey }
  };
}
