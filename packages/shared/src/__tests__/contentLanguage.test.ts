import { describe, expect, it } from "vitest";
import {
  contentLanguageEnglishName,
  looksLikeHebrew,
  normalizeContentLanguage,
  resolveContentLanguage,
  userFacingLanguageInstruction
} from "../contentLanguage.js";

describe("contentLanguage", () => {
  it("detects Hebrew from source text", () => {
    expect(looksLikeHebrew("סרטון על מוצר חדש")).toBe(true);
    expect(
      resolveContentLanguage({ title: "קמפיין", sourceText: "ילדים אוהבים את החטיף" })
    ).toBe("he");
  });

  it("uses creative language when set", () => {
    expect(resolveContentLanguage({ creativeLanguage: "אנגלית", sourceText: "עברית" })).toBe("en");
  });

  it("normalizes codes", () => {
    expect(normalizeContentLanguage("he-IL")).toBe("he");
    expect(contentLanguageEnglishName("he")).toBe("Hebrew");
  });

  it("builds language instruction for Hebrew", () => {
    const text = userFacingLanguageInstruction("he");
    expect(text).toContain("Hebrew");
    expect(text).toContain("do NOT translate");
  });
});
