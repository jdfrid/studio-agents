import {
  applyBrandTemplateToBrief,
  applyBrandVariation,
  clampVideoDurationSeconds,
  resolveRenderProfile,
  type BriefInput,
  type BrandTemplateView
} from "@studio/shared";

export function buildAutomationBrief(input: {
  product: { title: string; canonicalUrl: string; priceText: string | null; description: string | null };
  template: BrandTemplateView;
  attachments: BriefInput["attachments"];
}): BriefInput {
  const creative = applyBrandVariation(input.template, Math.random, {
    preserveKeys: input.template.variationPolicy.lockedCreativeKeys
  });
  const priceLine = input.product.priceText ? `Price: ${input.product.priceText}` : "";
  const sourceText = [
    input.product.title,
    priceLine,
    input.product.description?.trim() || "",
    `Product page: ${input.product.canonicalUrl}`
  ]
    .filter(Boolean)
    .join("\n\n");
  const durationSeconds = clampVideoDurationSeconds(input.template.durationSeconds ?? 30, false);
  const language = input.template.defaultCreative?.language === "en" ? "en" : "he";
  const title = (input.product.title.trim() || "Product").slice(0, 200);
  const brief: BriefInput = {
    title: title.length >= 2 ? title : `${title} ·`.slice(0, 200),
    sourceText: sourceText.slice(0, 20_000) || input.product.title,
    durationSeconds,
    aspectRatio: creative.videoOrientation === "landscape" ? "16:9" : "9:16",
    language,
    referenceLinks: [input.product.canonicalUrl],
    attachments: input.attachments,
    budgetMode: true,
    renderProfile: resolveRenderProfile().id,
    approvalMode: "auto",
    creative,
    brandTemplateId: input.template.id
  };
  return applyBrandTemplateToBrief(brief, input.template, { applyVariation: false });
}
