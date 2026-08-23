import { describe, expect, it } from "vitest";
import { sanitizeVeoPromptForExternalAudio } from "../veoPrompt.js";

describe("sanitizeVeoPromptForExternalAudio", () => {
  it("strips speaking/lip cues and appends silent suffix", () => {
    const out = sanitizeVeoPromptForExternalAudio(
      "Host faces camera and mouths the words while speaking about the product"
    );
    expect(out.toLowerCase()).not.toContain("mouths");
    expect(out.toLowerCase()).not.toContain("speaking");
    expect(out).toMatch(/Silent video only/i);
  });

  it("keeps motion context", () => {
    const out = sanitizeVeoPromptForExternalAudio("Woman holds product toward camera, soft smile");
    expect(out).toContain("holds product");
    expect(out).toMatch(/Silent video only/i);
  });
});
