import type { ProviderCredentialView } from "@studio/shared";
import { ProviderError } from "@studio/shared";
import { httpJson } from "../http.js";
import {
  describeGenerateContentFailure,
  extractInlineData,
  geminiModels,
  geminiUrl,
  normalizeGeminiImageAspectRatio
} from "./common.js";
import { reportGenerateContentUsage } from "./reportUsage.js";
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

const IMAGE_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildImageGenerationBody(req: GeminiImageRequest) {
  const referenceNote = req.referenceImageUrls?.length
    ? `\nUse these references for style/product consistency: ${req.referenceImageUrls.join(", ")}`
    : "";
  const aspectRatio = normalizeGeminiImageAspectRatio(req.aspectRatio);
  return {
    generationConfig: {
      // IMAGE-only modality often returns HTTP 200 with empty parts — both are required.
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio,
        imageSize: "1K"
      }
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${req.prompt}\nAspect ratio: ${aspectRatio}.${referenceNote}\nReturn a single production-ready reference frame.`
          }
        ]
      }
    ]
  };
}

export async function geminiGenerateImage(
  provider: ProviderCredentialView,
  req: GeminiImageRequest,
  onUsage?: GeminiUsageReporter
): Promise<GeminiImageResponse> {
  const model = geminiModels(provider).image;
  const started = Date.now();
  let lastDetail = "empty candidates/parts";

  for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt += 1) {
    const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
      method: "POST",
      body: buildImageGenerationBody(req),
      timeoutMs: 120_000
    });
    const inline = extractInlineData(response, "image/");
    if (inline) {
      await reportGenerateContentUsage(
        response,
        { activityType: "gemini_image", model, startedMs: started },
        onUsage
      );
      return { provider: "gemini", model, body: inline.data, mimeType: inline.mimeType };
    }

    lastDetail = describeGenerateContentFailure(response);
    if (attempt < IMAGE_ATTEMPTS) {
      await sleep(1500 * attempt);
    }
  }

  throw new ProviderError(`Gemini image generation returned no image inline data (${lastDetail})`, {
    provider: "gemini",
    metadata: { model, attempts: IMAGE_ATTEMPTS, detail: lastDetail }
  });
}
