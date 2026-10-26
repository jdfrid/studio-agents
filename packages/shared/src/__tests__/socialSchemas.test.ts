import { describe, expect, it } from "vitest";
import { CreateContentPackageRequestSchema, ConnectTelegramRequestSchema } from "../social/schemas.js";

describe("distribution request schemas", () => {
  it("requires at least one destination", () => {
    expect(() =>
      CreateContentPackageRequestSchema.parse({
        copy: { body: "hi" },
        destinationIds: []
      })
    ).toThrow();
  });

  it("accepts a text package with destinations", () => {
    const parsed = CreateContentPackageRequestSchema.parse({
      destinationIds: ["dest_1"],
      copy: { body: "hello", title: "T" }
    });
    expect(parsed.mode).toBe("now");
    expect(parsed.copy.hashtags).toEqual([]);
  });

  it("accepts a scheduled package with a delayed first comment", () => {
    const parsed = CreateContentPackageRequestSchema.parse({
      destinationIds: ["dest_1"],
      mode: "schedule",
      scheduleAt: "2026-10-26T18:00:00.000Z",
      firstComment: "https://reelmino.com/?utm_source=instagram",
      firstCommentDelayMinutes: 5,
      linkInFirstComment: true
    });
    expect(parsed.scheduleAt).toBe("2026-10-26T18:00:00.000Z");
    expect(parsed.firstCommentDelayMinutes).toBe(5);
    expect(parsed.linkInFirstComment).toBe(true);
  });

  it("rejects a short telegram token", () => {
    expect(() => ConnectTelegramRequestSchema.parse({ botToken: "short" })).toThrow();
  });
});
