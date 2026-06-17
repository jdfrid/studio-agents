import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";

export interface LlmJsonRequest {
  system: string;
  user: string;
  /** Provider-agnostic schema name passed to system prompt; the LLM is asked to return strict JSON. */
  schemaName: string;
  /** A JSON-schema-ish description shown to the LLM (string). */
  schemaHint: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmJsonResponse<T = unknown> {
  provider: string;
  model: string;
  raw: string;
  parsed: T;
}

export async function llmCompleteJson<T>(
  provider: ProviderCredentialView,
  req: LlmJsonRequest
): Promise<LlmJsonResponse<T>> {
  const name = provider.provider.toLowerCase();
  if (name.includes("openai")) return openaiJson<T>(provider, req);
  if (name.includes("anthropic") || name.includes("claude")) return anthropicJson<T>(provider, req);
  if (name.includes("gemini") || name.includes("google")) return geminiJson<T>(provider, req);
  if (name.includes("xai") || name.includes("grok")) return openaiJson<T>(provider, req, { baseUrl: "https://api.x.ai/v1" });
  throw new ProviderError(`Unsupported LLM provider: ${provider.provider}`, { provider: provider.provider });
}

function buildJsonPrompt(req: LlmJsonRequest) {
  return `${req.system}\n\nReturn ONLY a single JSON object matching schema "${req.schemaName}". Do not wrap in markdown.\nSchema hint:\n${req.schemaHint}\n\nUSER REQUEST:\n${req.user}`;
}

function tryParse<T>(raw: string): T {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`LLM response did not contain a JSON object: ${trimmed.slice(0, 400)}`);
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

async function openaiJson<T>(
  provider: ProviderCredentialView,
  req: LlmJsonRequest,
  override?: { baseUrl?: string }
): Promise<LlmJsonResponse<T>> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("LLM provider missing API key", { provider: provider.provider });
  const model = String(provider.config.model ?? (override?.baseUrl?.includes("x.ai") ? "grok-4" : "gpt-4o-mini"));
  const baseUrl = String(provider.config.baseUrl ?? override?.baseUrl ?? "https://api.openai.com/v1");
  const body = {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: buildJsonPrompt(req) }
    ],
    temperature: req.temperature ?? 0.4,
    max_tokens: req.maxOutputTokens ?? 2400
  };
  const resp = await httpJson<{ choices: Array<{ message: { content: string } }> }>(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body,
    timeoutMs: 90_000
  });
  const raw = resp.choices?.[0]?.message?.content ?? "";
  return { provider: provider.provider, model, raw, parsed: tryParse<T>(raw) };
}

async function anthropicJson<T>(provider: ProviderCredentialView, req: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("LLM provider missing API key", { provider: provider.provider });
  const model = String(provider.config.model ?? "claude-3-5-sonnet-latest");
  const baseUrl = String(provider.config.baseUrl ?? "https://api.anthropic.com/v1");
  const resp = await httpJson<{ content: Array<{ text: string }> }>(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: {
      model,
      max_tokens: req.maxOutputTokens ?? 2400,
      temperature: req.temperature ?? 0.4,
      system: req.system,
      messages: [{ role: "user", content: buildJsonPrompt(req) }]
    },
    timeoutMs: 90_000
  });
  const raw = resp.content?.[0]?.text ?? "";
  return { provider: provider.provider, model, raw, parsed: tryParse<T>(raw) };
}

async function geminiJson<T>(provider: ProviderCredentialView, req: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
  const apiKey = provider.secret;
  if (!apiKey) throw new ProviderError("LLM provider missing API key", { provider: provider.provider });
  const model = String(provider.config.model ?? "gemini-1.5-pro");
  const baseUrl = String(provider.config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta");
  const resp = await httpJson<{ candidates: Array<{ content: { parts: Array<{ text: string }> } }> }>(
    `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: {
        generationConfig: {
          temperature: req.temperature ?? 0.4,
          maxOutputTokens: req.maxOutputTokens ?? 2400,
          responseMimeType: "application/json"
        },
        systemInstruction: { role: "system", parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: buildJsonPrompt(req) }] }]
      },
      timeoutMs: 90_000
    }
  );
  const raw = resp.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { provider: provider.provider, model, raw, parsed: tryParse<T>(raw) };
}
