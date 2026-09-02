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

  it("rejects a short telegram token", () => {
    expect(() => ConnectTelegramRequestSchema.parse({ botToken: "short" })).toThrow();
  });
});
