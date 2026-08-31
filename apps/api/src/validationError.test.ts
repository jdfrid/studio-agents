import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiValidationError } from "./validationError.js";

describe("API validation errors", () => {
  it("returns a useful path and issue instead of a bare validation_error", () => {
    const result = z
      .object({ brief: z.object({ creative: z.object({ subtitleRotation: z.literal("-8") }) }) })
      .safeParse({ brief: { creative: { subtitleRotation: "tilt_left" } } });

    expect(result.success).toBe(false);
    if (result.success) return;

    const response = apiValidationError(result.error);
    expect(response.code).toBe("validation_error");
    expect(response.message).toContain("brief.creative.subtitleRotation");
    expect(response.details.issues[0]).toMatchObject({
      path: "brief.creative.subtitleRotation",
      code: "invalid_literal"
    });
  });
});
