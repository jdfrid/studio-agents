import { describe, expect, it } from "vitest";
import {
  applyBrandTemplateToBrief,
  applyBrandVariation,
  hexToAssColor,
  hexToFfmpegColor,
  contrastTextHex,
  BrandTemplateWriteSchema
} from "../index.js";
import type { BrandTemplateView } from "../schemas/brandTemplate.js";

const template = (): BrandTemplateView => ({
  id: "tmpl_1",
  name: "Deals shop",
  businessName: "DealsLuxy",
  slogan: "Luxury finds, honest prices",
  websiteUrl: "https://dealsluxy.com",
  primaryColor: "#C9A227",
  secondaryColor: "#0D1117",
  messages: ["Limited-time deal."],
  mustSay: ["Mention dealsluxy.com"],
  mustAvoid: ["Do not invent prices"],
  filmTemplate: "product_demo",
  durationSeconds: 30,
  platform: "instagram_reels",
  variationPolicy: { music: "vary", voice: "vary", visual: "lock" },
  defaultCreative: { designStyle: "יוקרתי", voiceCharacter: "female_warm" },
  logoGcsPath: "tenants/t1/brand-templates/tmpl_1/logo.png",
  logoName: "logo.png",
  logoMimeType: "image/png",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

describe("brand templates", () => {
  it("parses a write payload", () => {
    const parsed = BrandTemplateWriteSchema.parse({
      name: "Shop",
      messages: ["Shop the site"],
      mustSay: [],
      mustAvoid: [],
      primaryColor: "#C9A227"
    });
    expect(parsed.name).toBe("Shop");
    expect(parsed.primaryColor).toBe("#C9A227");
  });

  it("converts hex colors for ffmpeg and ASS", () => {
    expect(hexToFfmpegColor("#C9A227")).toBe("0xC9A227");
    expect(hexToAssColor("#C9A227")).toBe("&H0027A2C9");
    expect(contrastTextHex("#0D1117")).toBe("#F8FAFC");
    expect(contrastTextHex("#F5F0E6")).toBe("#111827");
  });

  it("locks visual style and varies music/voice", () => {
    const creative = applyBrandVariation(template(), () => 0);
    expect(creative.designStyle).toBe("יוקרתי");
    expect(creative.musicTempo).toBeTruthy();
    expect(creative.voiceCharacter).toBeTruthy();
    expect(creative.filmTemplate).toBe("product_demo");
    expect(creative.colorPalette).toBe("צבעי מותג");
  });

  it("hydrates branding, logo, and constraints without replacing the product story", () => {
    const brief = applyBrandTemplateToBrief(
      {
        title: "Gold watch",
        sourceText: "Today's product is a gold watch at $199",
        durationSeconds: 30,
        aspectRatio: "9:16",
        language: "en",
        attachments: [],
        referenceLinks: [],
        budgetMode: false,
        approvalMode: "auto"
      },
      template(),
      { applyVariation: false }
    );
    expect(brief.branding?.businessName).toBe("DealsLuxy");
    expect(brief.branding?.primaryColor).toBe("#C9A227");
    expect(brief.brandTemplateId).toBe("tmpl_1");
    expect(brief.attachments.some((item) => item.role === "logo" && item.gcsPath)).toBe(true);
    expect(brief.instructions).toContain("Mention dealsluxy.com");
    expect(brief.instructions).toContain("Do not invent prices");
    expect(brief.title).toBe("Gold watch");
    expect(brief.sourceText).toContain("gold watch");
  });
});
