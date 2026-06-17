import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import { extractText, geminiModels, geminiUrl } from "./common.js";

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
  req: GeminiJsonRequest
): Promise<GeminiJsonResponse<T>> {
  const model = geminiModels(provider).text;
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

  const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
    method: "POST",
    body: {
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxOutputTokens ?? 4096,
        responseMimeType: "application/json"
      },
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    },
    timeoutMs: 120_000
  });

  const raw = extractText(response);
  try {
    return { provider: "gemini", model, raw, parsed: parseJsonObject<T>(raw) };
  } catch (error) {
    throw new ProviderError(`Gemini JSON response could not be parsed: ${(error as Error).message}`, {
      provider: "gemini",
      metadata: { model, rawPreview: raw.slice(0, 800) }
    });
  }
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
