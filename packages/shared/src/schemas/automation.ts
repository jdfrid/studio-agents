import { z } from "zod";

export const AutomationCampaignStatusSchema = z.enum(["idle", "running", "paused", "needs_catalog"]);
export type AutomationCampaignStatus = z.infer<typeof AutomationCampaignStatusSchema>;

export const AutomationJobStatusSchema = z.enum(["queued", "scraping", "producing", "ready", "failed"]);
export type AutomationJobStatus = z.infer<typeof AutomationJobStatusSchema>;

export const AutomationCampaignWriteSchema = z.object({
  brandTemplateId: z.string().min(1).max(40).optional(),
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.string().url()),
  businessName: z.string().trim().min(1).max(120).optional(),
  slogan: z.string().trim().max(200).optional().nullable(),
  name: z.string().trim().min(2).max(80).optional(),
  timezone: z.string().trim().min(3).max(60).default("Asia/Jerusalem"),
  hourLocal: z.number().int().min(0).max(23).default(9),
  enabled: z.boolean().optional(),
  lockedCreativeKeys: z.array(z.string().trim().min(1).max(80)).max(40).optional()
});
export type AutomationCampaignWrite = z.infer<typeof AutomationCampaignWriteSchema>;

export const AutomationCampaignPatchSchema = z.object({
  enabled: z.boolean().optional(),
  timezone: z.string().trim().min(3).max(60).optional(),
  hourLocal: z.number().int().min(0).max(23).optional(),
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.string().url())
    .optional(),
});
export type AutomationCampaignPatch = z.infer<typeof AutomationCampaignPatchSchema>;

export const AutomationUrlsRequestSchema = z.object({
  urls: z.array(z.string().trim().url().max(500)).min(1).max(40)
});

export const AutomationProductViewSchema = z.object({
  id: z.string(),
  canonicalUrl: z.string(),
  title: z.string(),
  priceText: z.string().nullable(),
  description: z.string().nullable(),
  imageUrls: z.array(z.string()),
  usedAt: z.string().nullable(),
  lastFetchedAt: z.string().nullable()
});
export type AutomationProductView = z.infer<typeof AutomationProductViewSchema>;

export const AutomationJobViewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productTitle: z.string(),
  productUrl: z.string(),
  runId: z.string().nullable(),
  dayKey: z.string(),
  scheduledFor: z.string(),
  status: AutomationJobStatusSchema,
  error: z.string().nullable(),
  createdAt: z.string()
});
export type AutomationJobView = z.infer<typeof AutomationJobViewSchema>;

export const AutomationCampaignViewSchema = z.object({
  id: z.string(),
  brandTemplateId: z.string(),
  websiteUrl: z.string(),
  businessName: z.string().nullable().optional(),
  slogan: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  enabled: z.boolean(),
  timezone: z.string(),
  hourLocal: z.number(),
  status: AutomationCampaignStatusSchema,
  distributeMode: z.literal("hold"),
  lastError: z.string().nullable(),
  productCount: z.number(),
  unusedCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type AutomationCampaignView = z.infer<typeof AutomationCampaignViewSchema>;
