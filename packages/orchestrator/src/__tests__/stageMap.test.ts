import { describe, expect, it } from "vitest";
import { fromPrismaStage, toPrismaStage } from "../stageMap.js";

describe("stageMap", () => {
  it("maps package reserved word", () => {
    expect(toPrismaStage("package")).toBe("package_");
    expect(fromPrismaStage("package_" as any)).toBe("package");
  });
  it("passes through other stages", () => {
    for (const s of ["brief", "script", "audio", "asset", "render", "series"] as const) {
      expect(toPrismaStage(s)).toBe(s);
      expect(fromPrismaStage(s as any)).toBe(s);
    }
  });
});
