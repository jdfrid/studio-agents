import { describe, expect, it } from "vitest";
import { entriesSince, todayStamp } from "./whatsNew.js";

describe("entriesSince", () => {
  const catalog = [
    { id: "new", date: "2026-09-15" },
    { id: "mid", date: "2026-09-09" },
    { id: "old", date: "2026-09-01" }
  ];

  it("returns the full catalog on a first visit", () => {
    expect(entriesSince(null, catalog).map((entry) => entry.id)).toEqual(["new", "mid", "old"]);
  });

  it("returns only items dated after the last visit", () => {
    expect(entriesSince("2026-09-09", catalog).map((entry) => entry.id)).toEqual(["new"]);
  });

  it("returns nothing when everything was already seen", () => {
    expect(entriesSince("2026-09-15", catalog)).toEqual([]);
  });
});

describe("todayStamp", () => {
  it("formats a local calendar date", () => {
    expect(todayStamp(new Date(2026, 8, 5))).toBe("2026-09-05");
  });
});
