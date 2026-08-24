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

const IMAGE_ATTEMPTS = 4;
/** Too many / too-literal face refs often trigger promptFeedback blockReason=OTHER. */
const MAX_INLINE_REFS = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reduce trademark / luxury-brand triggers that often cause IMAGE_OTHER. */
export function softenImagePrompt(prompt: string, opts?: { hasReferencePhotos?: boolean }): string {
  const generic = prompt
    .replace(/\brolex\b/gi, "luxury Swiss watch")
    .replace(/\b(louis vuitton|gucci|chanel|hermes|prada|cartier|omega|patek philippe)\b/gi, "luxury fashion item")
    .replace(/\b(nike|adidas|apple|samsung|google|microsoft|amazon)\b/gi, "consumer tech product")
    .replace(/\b(coca-cola|pepsi|mcdonald's|starbucks)\b/gi, "beverage brand");
  if (opts?.hasReferencePhotos) {
    return `${generic}\nPreserve the exact faces from the uploaded reference photo(s) as the cast. No visible logos or trademarks. Unbranded product.`;
  }
  return `${generic}\nGeneric fictional people only. No visible logos, trademarks, or celebrity likenesses. Unbranded product.`;
}

function buildImageGenerationBody(
  prompt: string,
  req: GeminiImageRequest,
  referenceImages: Array<{ data: Buffer; mimeType: string }>
) {
  const referenceNote = req.referenceImageUrls?.length
    ? `\nUse these references for style/product consistency: ${req.referenceImageUrls.join(", ")}`
    : "";
  const hasInlineRefs = referenceImages.length > 0;
  const inlineRefNote = hasInlineRefs ? `\n${REFERENCE_IMAGE_INSTRUCTION}` : "";
  const aspectRatio = normalizeGeminiImageAspectRatio(req.aspectRatio);
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  for (const ref of referenceImages) {
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
  "The attached photo(s) ARE the on-screen cast: preserve each person's exact face, hair, skin tone, age, and identity. Do not invent different people. Keep wardrobe/setting continuity; change pose/action and camera as described. Do not copy real celebrity likenesses or brand logos unless they are literally in the uploaded photo.";

function isRetryableImageFailure(detail: string): boolean {
  const d = detail.toUpperCase();
  return (
    d.includes("IMAGE_OTHER") ||
    d.includes("IMAGE_SAFETY") ||
    d.includes("BLOCKREASON") ||
    d.includes("NO_IMAGE") ||
    d.includes("EMPTY") ||
    d.includes("SAFETY") ||
    d.includes("OTHER")
  );
}

export async function geminiGenerateImage(
  provider: ProviderCredentialView,
  req: GeminiImageRequest,
  onUsage?: GeminiUsageReporter
): Promise<GeminiImageResponse> {
  const model = geminiModels(provider).image;
  const started = Date.now();
  let lastDetail = "empty candidates/parts";

  const allRefs = (req.referenceImages ?? []).slice(0, MAX_INLINE_REFS);
  const hasRefs = allRefs.length > 0;
  const strategies: Array<{ prompt: string; refs: Array<{ data: Buffer; mimeType: string }>; label: string }> = [
    { prompt: req.prompt, refs: allRefs, label: "primary" },
    { prompt: softenImagePrompt(req.prompt, { hasReferencePhotos: hasRefs }), refs: allRefs, label: "softened" }
  ];
  if (allRefs.length > 1) {
    strategies.push({
      prompt: softenImagePrompt(req.prompt, { hasReferencePhotos: true }),
      refs: allRefs.slice(0, 1),
      label: "single-ref"
    });
  }
  // Never drop face refs when the user uploaded character photos — inventing faces breaks identity.

  for (const strategy of strategies) {
    for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt += 1) {
      const response = await httpJson<unknown>(geminiUrl(provider, `models/${model}:generateContent`), {
        method: "POST",
        body: buildImageGenerationBody(strategy.prompt, req, strategy.refs),
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
      if (!isRetryableImageFailure(lastDetail)) break;
      if (attempt < IMAGE_ATTEMPTS) await sleep(1500 * attempt);
    }
  }

  const hint =
    lastDetail.toUpperCase().includes("OTHER") ||
    lastDetail.toUpperCase().includes("SAFETY") ||
    lastDetail.includes("IMAGE_OTHER")
      ? " Gemini blocked the image (policy/faces/logos). Soften the prompt, use fewer inspiration photos, or rerun."
      : "";
  throw new ProviderError(`Gemini image generation returned no image inline data (${lastDetail})${hint}`, {
    provider: "gemini",
    metadata: { model, attempts: IMAGE_ATTEMPTS, detail: lastDetail, strategies: strategies.map((s) => s.label) }
  });
}
