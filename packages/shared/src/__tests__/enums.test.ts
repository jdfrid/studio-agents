import { describe, expect, it } from "vitest";
import { STAGE_ORDER, nextStage } from "../enums.js";

describe("stage ordering", () => {
  it("ends after series", () => {
    expect(nextStage("series")).toBeNull();
  });
  it("chains in declared order", () => {
    for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
      expect(nextStage(STAGE_ORDER[i]!)).toBe(STAGE_ORDER[i + 1]);
    }
  });
});
