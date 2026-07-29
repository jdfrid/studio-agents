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
  /** Prior frame bytes for visual continuity (inline conditioning). */
  referenceImages?: Array<{ data: Buffer; mimeType: string }>;
}

export interface GeminiImageResponse {
  provider: "gemini";
  model: string;
  body: Buffer;
  mimeType: string;
}

const IMAGE_ATTEMPTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reduce trademark / luxury-brand triggers that often cause IMAGE_OTHER. */
export function softenImagePrompt(prompt: string): string {
  const generic = prompt
    .replace(/\brolex\b/gi, "luxury Swiss watch")
    .replace(/\b(louis vuitton|gucci|chanel|hermes|prada|cartier|omega|patek philippe)\b/gi, "luxury fashion item")
    .replace(/\b(nike|adidas|apple|samsung|google|microsoft|amazon)\b/gi, "consumer tech product")
    .replace(/\b(coca-cola|pepsi|mcdonald's|starbucks)\b/gi, "beverage brand");
  return `${generic}\nGeneric fictional people only. No visible logos, trademarks, or celebrity likenesses. Unbranded product.`;
}

function buildImageGenerationBody(prompt: string, req: GeminiImageRequest) {
  const referenceNote = req.referenceImageUrls?.length
    ? `\nUse these references for style/product consistency: ${req.referenceImageUrls.join(", ")}`
    : "";
  const hasInlineRefs = (req.referenceImages?.length ?? 0) > 0;
  const inlineRefNote = hasInlineRefs
    ? `\n${REFERENCE_IMAGE_INSTRUCTION}`
    : "";
  const aspectRatio = normalizeGeminiImageAspectRatio(req.aspectRatio);
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  for (const ref of req.referenceImages ?? []) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.data.toString("base64")
      }
    });
  }
  parts.push({
    text: `${prompt}\nAspect ratio: ${aspectRatio}.${referenceNote}${inlineRefNote}\nReturn a single production-ready reference frame.`
  });
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
        parts
      }
    ]
  };
}

const REFERENCE_IMAGE_INSTRUCTION =
  "The attached reference image shows the EXACT characters and location. Generate the next frame with IDENTICAL people, faces, wardrobe, and setting; only change pose/action as described.";

export async function geminiGenerateImage(
  provider: ProviderCredentialView,
  req: GeminiImageRequest,
  onUsage?: GeminiUsageReporter
): Promise<GeminiImageResponse> {
  const model = geminiModels(provider).image;
  const started = Date.now();
  let lastDetail = "empty candidates/parts";
  const promptVariants = [req.prompt, softenImagePrompt(req.prompt)];

  for (let variant = 0; variant < promptVariants.length; variant += 1) {
    const prompt = promptVariants[variant]!;
    for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt += 1) {
      const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
        method: "POST",
        body: buildImageGenerationBody(prompt, req),
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
      const retryable = lastDetail.includes("IMAGE_OTHER") || lastDetail.includes("NO_IMAGE") || lastDetail.includes("empty");
      if (attempt < IMAGE_ATTEMPTS && retryable) {
        await sleep(2000 * attempt);
        continue;
      }
      if (!retryable && variant === 0) break;
      if (attempt < IMAGE_ATTEMPTS) await sleep(2000 * attempt);
    }
  }

  const hint =
    lastDetail.includes("IMAGE_OTHER") || lastDetail.includes("IMAGE_SAFETY")
      ? " Gemini may have blocked brand or policy content; try a generic prompt or rerun."
      : "";
  throw new ProviderError(`Gemini image generation returned no image inline data (${lastDetail})${hint}`, {
    provider: "gemini",
    metadata: { model, attempts: IMAGE_ATTEMPTS, detail: lastDetail }
  });
}
