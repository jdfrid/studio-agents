import { describe, expect, it } from "vitest";
import { campaignDayKey, campaignLocalHour, shouldProduceForLocalHour } from "../time.js";

describe("campaign local time", () => {
  it("formats a Jerusalem calendar day", () => {
    const noonUtc = new Date("2026-09-16T07:00:00.000Z");
    expect(campaignDayKey(noonUtc, "Asia/Jerusalem")).toBe("2026-09-16");
    expect(campaignLocalHour(noonUtc, "Asia/Jerusalem")).toBe(10);
  });

  it("produces at or after the local hour", () => {
    const noonUtc = new Date("2026-09-16T07:00:00.000Z");
    expect(shouldProduceForLocalHour(noonUtc, "Asia/Jerusalem", 9)).toBe(true);
    expect(shouldProduceForLocalHour(noonUtc, "Asia/Jerusalem", 11)).toBe(false);
  });
});
