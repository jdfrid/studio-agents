import { useEffect, useMemo, useState } from "react";
import { getCreativeFieldSections, type CreativeCatalogField, type Locale } from "@studio/shared";
import { apiGet } from "./api.js";

type CatalogResponse = { locale: Locale; fields: CreativeCatalogField[] };
const cache = new Map<Locale, CreativeCatalogField[]>();

function fallbackCatalog(locale: Locale): CreativeCatalogField[] {
  return getCreativeFieldSections(locale).flatMap((section, sectionIndex) =>
    section.fields.map((field, fieldIndex) => ({
      id: `fallback-${String(field.key)}`,
      key: String(field.key),
      sectionKey: section.id,
      sectionLabel: section.title,
      kind: field.kind,
      label: locale === "en" ? (field.labelEn ?? String(field.key)) : field.labelHe,
      sortOrder: sectionIndex * 100 + fieldIndex,
      config: {
        min: field.min,
        max: field.max,
        step: field.step,
        unit: field.unit
      },
      options: (field.options ?? []).map((option, optionIndex) => ({
        id: `fallback-${String(field.key)}-${option.code ?? optionIndex}`,
        code: option.code ?? String(option.value),
        value: String(option.value),
        label: locale === "en" ? (option.labelEn ?? option.value) : option.labelHe,
        sortOrder: optionIndex
      }))
    }))
  );
}

export function useCreativeCatalog(locale: Locale) {
  const [fields, setFields] = useState<CreativeCatalogField[]>(() => cache.get(locale) ?? fallbackCatalog(locale));

  useEffect(() => {
    const cached = cache.get(locale);
    if (cached) {
      setFields(cached);
      return;
    }
    setFields(fallbackCatalog(locale));
    void apiGet<CatalogResponse>(`/config/creative-catalog?locale=${locale}`)
      .then((response) => {
        if (!response.fields.length) return;
        cache.set(locale, response.fields);
        setFields(response.fields);
      })
      .catch(() => undefined);
  }, [locale]);

  return useMemo(
    () => ({
      fields,
      byKey: new Map(fields.map((field) => [field.key, field]))
    }),
    [fields]
  );
}
