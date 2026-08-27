import type {
  AdminCreativeField,
  CreativeCatalogField,
  CreativeFieldCreate,
  CreativeFieldUpdate,
  CreativeOptionCreate,
  CreativeOptionUpdate
} from "@studio/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./index.js";

const includeCatalog = {
  translations: true,
  options: { include: { translations: true }, orderBy: { sortOrder: "asc" as const } }
};

function translation<T extends { locale: string }>(rows: T[], locale: string): T | undefined {
  return rows.find((row) => row.locale === locale) ?? rows.find((row) => row.locale === "he") ?? rows.find((row) => row.locale === "en");
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function getCreativeCatalog(locale: string): Promise<CreativeCatalogField[]> {
  const fields = await prisma.creativeField.findMany({
    where: { active: true, deletedAt: null },
    include: includeCatalog,
    orderBy: { sortOrder: "asc" }
  });
  return fields.map((field) => {
    const text = translation(field.translations, locale);
    return {
      id: field.id,
      key: field.key,
      sectionKey: field.sectionKey,
      sectionLabel: text?.sectionLabel ?? field.sectionKey,
      kind: field.kind as "select" | "number",
      label: text?.label ?? field.key,
      helpText: text?.helpText ?? undefined,
      placeholder: text?.placeholder ?? undefined,
      sortOrder: field.sortOrder,
      config: jsonObject(field.config),
      options: field.options
        .filter((option) => option.active && option.deletedAt === null)
        .map((option) => ({
          id: option.id,
          code: option.code,
          value: option.value,
          label: translation(option.translations, locale)?.label ?? option.value,
          sortOrder: option.sortOrder
        }))
    };
  });
}

export async function getAdminCreativeCatalog(): Promise<AdminCreativeField[]> {
  const fields = await prisma.creativeField.findMany({
    where: { deletedAt: null },
    include: includeCatalog,
    orderBy: { sortOrder: "asc" }
  });
  return fields.map((field) => ({
    id: field.id,
    key: field.key,
    sectionKey: field.sectionKey,
    kind: field.kind as "select" | "number",
    labels: {
      he: field.translations.find((row) => row.locale === "he")?.label ?? "",
      en: field.translations.find((row) => row.locale === "en")?.label ?? ""
    },
    sectionLabels: {
      he: field.translations.find((row) => row.locale === "he")?.sectionLabel ?? "",
      en: field.translations.find((row) => row.locale === "en")?.sectionLabel ?? ""
    },
    helpText: {
      he: field.translations.find((row) => row.locale === "he")?.helpText ?? "",
      en: field.translations.find((row) => row.locale === "en")?.helpText ?? ""
    },
    placeholders: {
      he: field.translations.find((row) => row.locale === "he")?.placeholder ?? "",
      en: field.translations.find((row) => row.locale === "en")?.placeholder ?? ""
    },
    sortOrder: field.sortOrder,
    active: field.active,
    isRequired: field.isRequired,
    isProtected: field.isProtected,
    deletedAt: field.deletedAt?.toISOString() ?? null,
    config: jsonObject(field.config),
    options: field.options
      .filter((option) => option.deletedAt === null)
      .map((option) => ({
        id: option.id,
        code: option.code,
        value: option.value,
        labels: {
          he: option.translations.find((row) => row.locale === "he")?.label ?? "",
          en: option.translations.find((row) => row.locale === "en")?.label ?? ""
        },
        sortOrder: option.sortOrder,
        active: option.active,
        deletedAt: option.deletedAt?.toISOString() ?? null
      }))
  }));
}

export async function createCreativeField(input: CreativeFieldCreate) {
  const max = await prisma.creativeField.aggregate({ _max: { sortOrder: true } });
  return prisma.creativeField.create({
    data: {
      key: input.key,
      sectionKey: input.sectionKey,
      kind: input.kind,
      isRequired: input.isRequired,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
      config: input.config as Prisma.InputJsonValue,
      translations: {
        create: (["he", "en"] as const).map((locale) => ({
          locale,
          label: input.labels[locale],
          sectionLabel: input.sectionLabels[locale],
          helpText: input.helpText?.[locale] || null,
          placeholder: input.placeholders?.[locale] || null
        }))
      }
    }
  });
}

export async function updateCreativeField(id: string, input: CreativeFieldUpdate) {
  return prisma.$transaction(async (tx) => {
    await requireField(tx, id);
    await tx.creativeField.update({
      where: { id },
      data: input.config ? { config: input.config as Prisma.InputJsonValue } : {}
    });
    for (const locale of ["he", "en"] as const) {
      if (!input.labels && !input.sectionLabels && !input.helpText && !input.placeholders) continue;
      const current = await tx.creativeFieldTranslation.findUnique({ where: { fieldId_locale: { fieldId: id, locale } } });
      await tx.creativeFieldTranslation.upsert({
        where: { fieldId_locale: { fieldId: id, locale } },
        update: {
          ...(input.labels ? { label: input.labels[locale] } : {}),
          ...(input.sectionLabels ? { sectionLabel: input.sectionLabels[locale] } : {}),
          ...(input.helpText ? { helpText: input.helpText[locale] || null } : {}),
          ...(input.placeholders ? { placeholder: input.placeholders[locale] || null } : {})
        },
        create: {
          fieldId: id,
          locale,
          label: input.labels?.[locale] ?? current?.label ?? "",
          sectionLabel: input.sectionLabels?.[locale] ?? current?.sectionLabel ?? "",
          helpText: input.helpText?.[locale] || current?.helpText || null,
          placeholder: input.placeholders?.[locale] || current?.placeholder || null
        }
      });
    }
  });
}

export async function setCreativeFieldActive(id: string, active: boolean) {
  const field = await requireField(prisma, id);
  if (!active && (field.isRequired || field.isProtected)) throw new Error("required_field_protected");
  return prisma.creativeField.update({ where: { id }, data: { active } });
}

export async function deleteCreativeField(id: string) {
  const field = await requireField(prisma, id);
  if (field.isRequired || field.isProtected) throw new Error("required_field_protected");
  return prisma.creativeField.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
}

export async function reorderCreativeFields(ids: string[]) {
  const rows = await prisma.creativeField.findMany({ where: { deletedAt: null }, select: { id: true } });
  assertCompleteOrder(rows.map((row) => row.id), ids);
  await prisma.$transaction(ids.map((id, sortOrder) => prisma.creativeField.update({ where: { id }, data: { sortOrder } })));
}

export async function createCreativeOption(fieldId: string, input: CreativeOptionCreate) {
  await requireField(prisma, fieldId);
  const max = await prisma.creativeOption.aggregate({ where: { fieldId, deletedAt: null }, _max: { sortOrder: true } });
  return prisma.creativeOption.create({
    data: {
      fieldId,
      code: input.code,
      value: input.value,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
      translations: {
        create: (["he", "en"] as const).map((locale) => ({ locale, label: input.labels[locale] }))
      }
    }
  });
}

export async function updateCreativeOption(id: string, input: CreativeOptionUpdate) {
  const option = await requireOption(prisma, id);
  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (input.value) {
    operations.push(prisma.creativeOption.update({ where: { id }, data: { value: input.value } }));
  }
  if (input.labels) {
    operations.push(
      ...(["he", "en"] as const).map((locale) =>
      prisma.creativeOptionTranslation.upsert({
        where: { optionId_locale: { optionId: id, locale } },
        update: { label: input.labels![locale] },
        create: { optionId: id, locale, label: input.labels![locale] }
      })
      )
    );
  }
  if (operations.length) await prisma.$transaction(operations);
  return option;
}

export async function setCreativeOptionActive(id: string, active: boolean) {
  await requireOption(prisma, id);
  return prisma.creativeOption.update({ where: { id }, data: { active } });
}

export async function deleteCreativeOption(id: string) {
  await requireOption(prisma, id);
  return prisma.creativeOption.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
}

export async function reorderCreativeOptions(fieldId: string, ids: string[]) {
  await requireField(prisma, fieldId);
  const rows = await prisma.creativeOption.findMany({ where: { fieldId, deletedAt: null }, select: { id: true } });
  assertCompleteOrder(rows.map((row) => row.id), ids);
  await prisma.$transaction(ids.map((id, sortOrder) => prisma.creativeOption.update({ where: { id }, data: { sortOrder } })));
}

type Db = PrismaClient | Prisma.TransactionClient;

async function requireField(db: Db, id: string) {
  const field = await db.creativeField.findFirst({ where: { id, deletedAt: null } });
  if (!field) throw new Error("creative_field_not_found");
  return field;
}

async function requireOption(db: Db, id: string) {
  const option = await db.creativeOption.findFirst({ where: { id, deletedAt: null } });
  if (!option) throw new Error("creative_option_not_found");
  return option;
}

function assertCompleteOrder(existing: string[], submitted: string[]) {
  if (existing.length !== submitted.length || new Set(submitted).size !== submitted.length || existing.some((id) => !submitted.includes(id))) {
    throw new Error("invalid_complete_order");
  }
}
