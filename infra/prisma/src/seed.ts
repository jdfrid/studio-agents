import { PrismaClient } from "@prisma/client";
import { CREATIVE_FIELD_SECTIONS } from "@studio/shared";

const prisma = new PrismaClient();

async function main() {
  const slug = process.env.DEFAULT_TENANT_SLUG ?? "demo";
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { slug, name: "Demo Tenant" }
  });
  // eslint-disable-next-line no-console
  console.log("Seeded tenant:", tenant);

  const protectedKeys = new Set(["language", "videoOrientation", "filmTemplate"]);
  let fieldOrder = 0;
  for (const section of CREATIVE_FIELD_SECTIONS) {
    for (const fieldDef of section.fields) {
      const field = await prisma.creativeField.upsert({
        where: { key: fieldDef.key },
        update: {
          sectionKey: section.id,
          kind: fieldDef.kind,
          sortOrder: fieldOrder,
          active: true,
          isProtected: protectedKeys.has(fieldDef.key)
        },
        create: {
          key: fieldDef.key,
          sectionKey: section.id,
          kind: fieldDef.kind,
          sortOrder: fieldOrder,
          active: true,
          isRequired: fieldDef.key === "language",
          isProtected: protectedKeys.has(fieldDef.key),
          config: {
            min: fieldDef.min,
            max: fieldDef.max,
            step: fieldDef.step,
            unit: fieldDef.unit
          }
        }
      });
      fieldOrder += 1;

      for (const locale of ["he", "en"] as const) {
        await prisma.creativeFieldTranslation.upsert({
          where: { fieldId_locale: { fieldId: field.id, locale } },
          update: {
            label: locale === "he" ? fieldDef.labelHe : (fieldDef.labelEn ?? fieldDef.key),
            sectionLabel: locale === "he" ? section.titleHe : (section.titleEn ?? section.id)
          },
          create: {
            fieldId: field.id,
            locale,
            label: locale === "he" ? fieldDef.labelHe : (fieldDef.labelEn ?? fieldDef.key),
            sectionLabel: locale === "he" ? section.titleHe : (section.titleEn ?? section.id)
          }
        });
      }

      for (const [sortOrder, optionDef] of (fieldDef.options ?? []).entries()) {
        const code = optionDef.code ?? `${fieldDef.key}_${sortOrder}`;
        const option = await prisma.creativeOption.upsert({
          where: { fieldId_code: { fieldId: field.id, code } },
          update: { value: optionDef.value, sortOrder, active: true },
          create: { fieldId: field.id, code, value: optionDef.value, sortOrder, active: true }
        });
        for (const locale of ["he", "en"] as const) {
          const label = locale === "he" ? optionDef.labelHe : (optionDef.labelEn ?? optionDef.value);
          await prisma.creativeOptionTranslation.upsert({
            where: { optionId_locale: { optionId: option.id, locale } },
            update: { label },
            create: { optionId: option.id, locale, label }
          });
        }
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log("Seeded creative field catalog");
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
