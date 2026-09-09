import { describe, expect, it } from "vitest";
import { ContactRequestSchema } from "../schemas/contact.js";

describe("ContactRequestSchema", () => {
  it("accepts a valid inquiry", () => {
    const parsed = ContactRequestSchema.parse({
      name: "Dana",
      email: "dana@example.com",
      subject: "Credits",
      message: "I need more credits for the studio.",
      locale: "he"
    });
    expect(parsed.email).toBe("dana@example.com");
  });

  it("rejects a short message", () => {
    expect(() =>
      ContactRequestSchema.parse({
        name: "Dana",
        email: "dana@example.com",
        subject: "Hello there",
        message: "too short"
      })
    ).toThrow();
  });
});
