import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import { extractInlineData, geminiModels, geminiUrl } from "./common.js";
import type { GeminiUsageReporter } from "./usage.js";

export interface GeminiImageRequest {
  prompt: string;
  aspectRatio: string;
  referenceImageUrls?: string[];
}

export interface GeminiImageResponse {
  provider: "gemini";
  model: string;
  body: Buffer;
  mimeType: string;
}

export async function geminiGenerateImage(
  provider: ProviderCredentialView,
  req: GeminiImageRequest,
  onUsage?: GeminiUsageReporter
): Promise<GeminiImageResponse> {
  const model = geminiModels(provider).image;
  const started = Date.now();
  const referenceNote = req.referenceImageUrls?.length
    ? `\nUse these references for style/product consistency: ${req.referenceImageUrls.join(", ")}`
    : "";
  const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
    method: "POST",
    body: {
      generationConfig: {
        responseModalities: ["IMAGE"]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${req.prompt}\nAspect ratio: ${req.aspectRatio}.${referenceNote}\nReturn a single production-ready reference frame.`
            }
          ]
        }
      ]
    },
    timeoutMs: 120_000
  });
  const inline = extractInlineData(response, "image/");
  if (!inline) {
    throw new ProviderError("Gemini image generation returned no image inline data", {
      provider: "gemini",
      metadata: { model }
    });
  }
  await onUsage?.({
    activityType: "gemini_image",
    model,
    durationMs: Date.now() - started,
    billedUnits: 1,
    unit: "image_call",
    charged: "yes"
  });
  return { provider: "gemini", model, body: inline.data, mimeType: inline.mimeType };
}
