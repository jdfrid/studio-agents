import type { BrandTemplateView, BrandTemplateWrite } from "@studio/shared";
import { BrandTemplateWriteSchema, BrandVariationPolicySchema, CreativeOptionsSchema } from "@studio/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "./index.js";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 8) : [];
}

function variationPolicyJson(value: unknown): Prisma.InputJsonValue {
  return BrandVariationPolicySchema.parse(value ?? {}) as Prisma.InputJsonValue;
}

function creativeJson(value: unknown): Prisma.InputJsonValue {
  return (CreativeOptionsSchema.catch({}).parse(value ?? {}) ?? {}) as Prisma.InputJsonValue;
}

export async function listBrandTemplateRows(tenantId: string) {
  return prisma.brandTemplate.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getBrandTemplateRow(tenantId: string, id: string) {
  return prisma.brandTemplate.findFirst({ where: { id, tenantId } });
}

export async function createBrandTemplateRow(
  tenantId: string,
  input: BrandTemplateWrite,
  logo?: { gcsPath: string; mimeType: string; name: string } | null
) {
  const parsed = BrandTemplateWriteSchema.parse(input);
  return prisma.brandTemplate.create({
    data: {
      tenantId,
      name: parsed.name,
      businessName: parsed.businessName || null,
      slogan: parsed.slogan || null,
      websiteUrl: parsed.websiteUrl || null,
      primaryColor: parsed.primaryColor || null,
      secondaryColor: parsed.secondaryColor || null,
      messages: asStringArray(parsed.messages),
      mustSay: asStringArray(parsed.mustSay),
      mustAvoid: asStringArray(parsed.mustAvoid),
      filmTemplate: parsed.filmTemplate || null,
      durationSeconds: parsed.durationSeconds ?? null,
      platform: parsed.platform || null,
      variationPolicy: variationPolicyJson(parsed.variationPolicy),
      defaultCreative: creativeJson(parsed.defaultCreative),
      logoGcsPath: logo?.gcsPath ?? null,
      logoMimeType: logo?.mimeType ?? null,
      logoName: logo?.name ?? null
    }
  });
}

export async function updateBrandTemplateRow(
  tenantId: string,
  id: string,
  input: BrandTemplateWrite,
  logo?: { gcsPath: string; mimeType: string; name: string } | null | "clear"
) {
  const parsed = BrandTemplateWriteSchema.parse(input);
  const existing = await prisma.brandTemplate.findFirst({ where: { id, tenantId } });
  if (!existing) return null;
  return prisma.brandTemplate.update({
    where: { id },
    data: {
      name: parsed.name,
      businessName: parsed.businessName || null,
      slogan: parsed.slogan || null,
      websiteUrl: parsed.websiteUrl || null,
      primaryColor: parsed.primaryColor || null,
      secondaryColor: parsed.secondaryColor || null,
      messages: asStringArray(parsed.messages),
      mustSay: asStringArray(parsed.mustSay),
      mustAvoid: asStringArray(parsed.mustAvoid),
      filmTemplate: parsed.filmTemplate || null,
      durationSeconds: parsed.durationSeconds ?? null,
      platform: parsed.platform || null,
      variationPolicy: variationPolicyJson(parsed.variationPolicy),
      defaultCreative: creativeJson(parsed.defaultCreative),
      ...(logo === "clear"
        ? { logoGcsPath: null, logoMimeType: null, logoName: null }
        : logo
          ? { logoGcsPath: logo.gcsPath, logoMimeType: logo.mimeType, logoName: logo.name }
          : {})
    }
  });
}

export async function deleteBrandTemplateRow(tenantId: string, id: string) {
  const existing = await prisma.brandTemplate.findFirst({ where: { id, tenantId } });
  if (!existing) return false;
  await prisma.brandTemplate.delete({ where: { id } });
  return true;
}

export function toBrandTemplateView(
  row: NonNullable<Awaited<ReturnType<typeof getBrandTemplateRow>>>,
  logoUrl?: string | null
): BrandTemplateView {
  const variationPolicy = BrandVariationPolicySchema.parse(row.variationPolicy ?? {});
  const defaultCreative = CreativeOptionsSchema.catch({}).parse(row.defaultCreative ?? {});
  return {
    id: row.id,
    name: row.name,
    businessName: row.businessName,
    slogan: row.slogan,
    websiteUrl: row.websiteUrl,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    messages: row.messages,
    mustSay: row.mustSay,
    mustAvoid: row.mustAvoid,
    filmTemplate: row.filmTemplate,
    durationSeconds: row.durationSeconds,
    platform: row.platform,
    variationPolicy,
    defaultCreative,
    logoGcsPath: row.logoGcsPath,
    logoMimeType: row.logoMimeType,
    logoName: row.logoName,
    logoUrl: logoUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
