import type { ProviderCredentialView } from "@studio/shared";

import { ProviderError } from "@studio/shared";

import { httpJson } from "../http.js";

import { parseJsonObjectWithRepair } from "../jsonParse.js";

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



const MAX_JSON_API_ATTEMPTS = 3;



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

    "Do not use markdown fences. Escape double quotes inside string values with backslash.",

    "Schema hint:",

    req.schemaHint,

    "",

    "User input:",

    req.user

  ].join("\n");



  const baseTokens = req.maxOutputTokens ?? 4096;

  let lastRaw = "";

  let lastError: Error | null = null;



  for (let attempt = 1; attempt <= MAX_JSON_API_ATTEMPTS; attempt += 1) {

    const maxOutputTokens = Math.min(baseTokens * attempt, 16384);

    const temperature = attempt === 1 ? (req.temperature ?? 0.3) : 0.15;

    const response = await callGemini(provider, model, prompt, { ...req, temperature }, maxOutputTokens);

    lastRaw = extractText(response);

    try {

      const parsed = parseJsonObjectWithRepair<T>(lastRaw);

      await reportGenerateContentUsage(response, { activityType: "gemini_text", model, startedMs: started }, onUsage);

      return { provider: "gemini", model, raw: lastRaw, parsed };

    } catch (error) {

      lastError = error instanceof Error ? error : new Error(String(error));

    }

  }



  throw new ProviderError(`Gemini JSON response could not be parsed: ${lastError?.message ?? "unknown"}`, {

    provider: "gemini",

    metadata: { model, rawPreview: lastRaw.slice(0, 1200), attempts: MAX_JSON_API_ATTEMPTS }

  });

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



/** @deprecated Use parseJsonObjectWithRepair from jsonParse.js */

export function parseJsonObject<T>(raw: string): T {

  return parseJsonObjectWithRepair<T>(raw);

}


