import { describe, expect, it } from "vitest";
import {
  CreativeFieldCreateSchema,
  CreativeOptionCreateSchema,
  CreativeReorderSchema
} from "../index.js";

describe("creative catalog schemas", () => {
  it("requires Hebrew and English field translations", () => {
    const result = CreativeFieldCreateSchema.safeParse({
      key: "cameraMood",
      sectionKey: "custom",
      kind: "select",
      labels: { he: "אווירת מצלמה", en: "" },
      sectionLabels: { he: "מותאם", en: "Custom" },
      config: {}
    });
    expect(result.success).toBe(false);
  });

  it("accepts stable option codes separately from semantic legacy values", () => {
    const result = CreativeOptionCreateSchema.parse({
      code: "clean_modern",
      value: "נקי ומודרני",
      labels: { he: "נקי ומודרני", en: "Clean and modern" }
    });
    expect(result.code).toBe("clean_modern");
    expect(result.value).toBe("נקי ומודרני");
  });

  it("rejects duplicate reorder ids", () => {
    expect(
      CreativeReorderSchema.safeParse({ ids: ["field-1", "field-1"] }).success
    ).toBe(false);
  });
});
