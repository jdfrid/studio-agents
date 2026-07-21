import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import { extractText, geminiModels, geminiUrl } from "./common.js";
import { reportGenerateContentUsage } from "./reportUsage.js";
import type { GeminiUsageReporter } from "./usage.js";

export interface GeminiJsonRequest {
  system: string;
  user: string;
  schemaName: string;
  schemaHint: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiJsonResponse<T> {
  provider: "gemini";
  model: string;
  raw: string;
  parsed: T;
}

export async function geminiCompleteJson<T>(
  provider: ProviderCredentialView,
  req: GeminiJsonRequest,
  onUsage?: GeminiUsageReporter
): Promise<GeminiJsonResponse<T>> {
  const model = geminiModels(provider).text;
  const started = Date.now();
  const prompt = [
    req.system,
    "",
    `Return ONLY a JSON object matching schema "${req.schemaName}".`,
    "Do not use markdown fences.",
    "Schema hint:",
    req.schemaHint,
    "",
    "User input:",
    req.user
  ].join("\n");

  const baseTokens = req.maxOutputTokens ?? 4096;
  const response = await callGemini(provider, model, prompt, req, baseTokens);
  let raw = extractText(response);
  try {
    const parsed = parseJsonObject<T>(raw);
    await reportGenerateContentUsage(response, { activityType: "gemini_text", model, startedMs: started }, onUsage);
    return { provider: "gemini", model, raw, parsed };
  } catch (firstError) {
    if (baseTokens < 16384) {
      const retry = await callGemini(provider, model, prompt, req, Math.min(baseTokens * 2, 16384));
      raw = extractText(retry);
      try {
        const parsed = parseJsonObject<T>(raw);
        await reportGenerateContentUsage(retry, { activityType: "gemini_text", model, startedMs: started }, onUsage);
        return { provider: "gemini", model, raw, parsed };
      } catch {
        /* fall through */
      }
    }
    throw new ProviderError(`Gemini JSON response could not be parsed: ${(firstError as Error).message}`, {
      provider: "gemini",
      metadata: { model, rawPreview: raw.slice(0, 800) }
    });
  }
}

async function callGemini(
  provider: ProviderCredentialView,
  model: string,
  prompt: string,
  req: GeminiJsonRequest,
  maxOutputTokens: number
): Promise<unknown> {
  return httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
    method: "POST",
    body: {
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens,
        responseMimeType: "application/json"
      },
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    },
    timeoutMs: 120_000
  });
}

function parseJsonObject<T>(raw: string): T {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("no JSON object found");
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}
