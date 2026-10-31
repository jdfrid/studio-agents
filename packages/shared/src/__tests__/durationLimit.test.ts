import { describe, expect, it } from "vitest";
import {
  clampVideoDurationSeconds,
  durationOptionsFor,
  maxVideoDurationSeconds,
  taskDurationSeconds
} from "../schemas/platform.js";

describe("video duration limits", () => {
  it("offers only a 30-second video length", () => {
    expect(maxVideoDurationSeconds(false)).toBe(30);
    expect(maxVideoDurationSeconds(true)).toBe(30);
    expect(durationOptionsFor(false)).toEqual([30]);
    expect(durationOptionsFor(true)).toEqual([30]);
  });

  it("clamps draft and remix lengths to 30 seconds", () => {
    expect(clampVideoDurationSeconds(60, false)).toBe(30);
    expect(clampVideoDurationSeconds(45, true)).toBe(30);
    expect(clampVideoDurationSeconds(3, false)).toBe(30);
  });

  it("accepts a growth task length from 30 seconds through 10 minutes", () => {
    expect(taskDurationSeconds(30)).toBe(30);
    expect(taskDurationSeconds(600)).toBe(600);
    expect(taskDurationSeconds(45)).toBeNull();
    expect(taskDurationSeconds(700)).toBeNull();
  });
});
