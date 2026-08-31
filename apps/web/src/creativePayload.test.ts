import { describe, expect, it } from "vitest";
import { creativePayloadForRequest } from "./creativePayload.js";

describe("creative request payload", () => {
  it("preserves typed subtitle values instead of catalog option codes", () => {
    expect(
      creativePayloadForRequest({
        subtitlePosition: "top",
        subtitleRotation: "-8",
        subtitleEffect: "background"
      })
    ).toEqual({
      subtitlePosition: "top",
      subtitleRotation: "-8",
      subtitleEffect: "background"
    });
  });

  it("omits an empty creative object", () => {
    expect(creativePayloadForRequest({})).toBeUndefined();
  });
});
