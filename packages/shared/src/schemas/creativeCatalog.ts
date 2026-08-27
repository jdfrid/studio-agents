import { z } from "zod";

export const CreativeLocaleSchema = z.enum(["he", "en"]);
export type CreativeLocale = z.infer<typeof CreativeLocaleSchema>;

export const CreativeTranslationInputSchema = z.object({
  he: z.string().trim().min(1).max(160),
  en: z.string().trim().min(1).max(160)
});
export const CreativeOptionalTranslationInputSchema = z.object({
  he: z.string().trim().max(500).default(""),
  en: z.string().trim().max(500).default("")
});

export const CreativeFieldKindSchema = z.enum(["select", "number"]);

export const CreativeFieldCreateSchema = z.object({
  key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]*$/).max(80),
  sectionKey: z.string().trim().regex(/^[a-z][a-z0-9_-]*$/).max(80),
  kind: CreativeFieldKindSchema,
  labels: CreativeTranslationInputSchema,
  sectionLabels: CreativeTranslationInputSchema,
  helpText: CreativeOptionalTranslationInputSchema.optional(),
  placeholders: CreativeOptionalTranslationInputSchema.optional(),
  isRequired: z.boolean().default(false),
  config: z.record(z.unknown()).default({})
});

export const CreativeFieldUpdateSchema = z.object({
  labels: CreativeTranslationInputSchema.optional(),
  sectionLabels: CreativeTranslationInputSchema.optional(),
  helpText: CreativeOptionalTranslationInputSchema.optional(),
  placeholders: CreativeOptionalTranslationInputSchema.optional(),
  config: z.record(z.unknown()).optional()
});

export const CreativeOptionCreateSchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_-]*$/).max(100),
  value: z.string().trim().min(1).max(160),
  labels: CreativeTranslationInputSchema
});

export const CreativeOptionUpdateSchema = z.object({
  value: z.string().trim().min(1).max(160).optional(),
  labels: CreativeTranslationInputSchema.optional()
});

export const CreativeReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).refine((ids) => new Set(ids).size === ids.length, "duplicate ids")
});

export const CreativeActivePatchSchema = z.object({ active: z.boolean() });

export type CreativeFieldCreate = z.infer<typeof CreativeFieldCreateSchema>;
export type CreativeFieldUpdate = z.infer<typeof CreativeFieldUpdateSchema>;
export type CreativeOptionCreate = z.infer<typeof CreativeOptionCreateSchema>;
export type CreativeOptionUpdate = z.infer<typeof CreativeOptionUpdateSchema>;

export type CreativeCatalogOption = {
  id: string;
  code: string;
  value: string;
  label: string;
  sortOrder: number;
};

export type CreativeCatalogField = {
  id: string;
  key: string;
  sectionKey: string;
  sectionLabel: string;
  kind: "select" | "number";
  label: string;
  helpText?: string;
  placeholder?: string;
  sortOrder: number;
  config: Record<string, unknown>;
  options: CreativeCatalogOption[];
};

export type AdminCreativeTranslation = { he: string; en: string };

export type AdminCreativeOption = {
  id: string;
  code: string;
  value: string;
  labels: AdminCreativeTranslation;
  sortOrder: number;
  active: boolean;
  deletedAt: string | null;
};

export type AdminCreativeField = {
  id: string;
  key: string;
  sectionKey: string;
  kind: "select" | "number";
  labels: AdminCreativeTranslation;
  sectionLabels: AdminCreativeTranslation;
  helpText: AdminCreativeTranslation;
  placeholders: AdminCreativeTranslation;
  sortOrder: number;
  active: boolean;
  isRequired: boolean;
  isProtected: boolean;
  deletedAt: string | null;
  config: Record<string, unknown>;
  options: AdminCreativeOption[];
};
