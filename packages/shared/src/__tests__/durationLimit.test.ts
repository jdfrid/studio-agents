import { describe, expect, it } from "vitest";
import {
  clampVideoDurationSeconds,
  durationOptionsFor,
  maxVideoDurationSeconds
} from "../schemas/platform.js";

describe("video duration limits", () => {
  it("caps new videos at 30 seconds unless admin allows longer", () => {
    expect(maxVideoDurationSeconds(false)).toBe(30);
    expect(maxVideoDurationSeconds(true)).toBe(180);
    expect(durationOptionsFor(false)).toEqual([15, 30]);
    expect(durationOptionsFor(true)).toEqual([15, 30, 45, 60]);
  });

  it("clamps draft and remix lengths when longer videos are disabled", () => {
    expect(clampVideoDurationSeconds(60, false)).toBe(30);
    expect(clampVideoDurationSeconds(45, true)).toBe(45);
    expect(clampVideoDurationSeconds(3, false)).toBe(5);
  });
});
