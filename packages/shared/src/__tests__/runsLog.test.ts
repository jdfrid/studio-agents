import { describe, expect, it } from "vitest";
import { formatDurationMs, runTotalDurationMs, stageDurationMs } from "../runsLog.js";

describe("runsLog helpers", () => {
  it("computes stage duration", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T10:02:30Z");
    expect(stageDurationMs(start, end)).toBe(150_000);
  });

  it("formats durations", () => {
    expect(formatDurationMs(500)).toBe("500ms");
    expect(formatDurationMs(45_000)).toBe("45.0s");
    expect(formatDurationMs(125_000)).toBe("2m 5s");
  });

  it("formats durations without 60s rollover bug", () => {
    expect(formatDurationMs(659_999)).toBe("11m");
  });

  it("computes run total duration to latest stage completion", () => {
    const created = new Date("2026-01-01T10:00:00Z");
    const updated = new Date("2026-01-01T10:30:00Z");
    const completed = [new Date("2026-01-01T10:05:00Z"), new Date("2026-01-01T10:12:00Z")];
    expect(runTotalDurationMs(created, updated, completed)).toBe(12 * 60 * 1000);
  });
});
