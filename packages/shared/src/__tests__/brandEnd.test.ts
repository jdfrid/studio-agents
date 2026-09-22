import { describe, expect, it } from "vitest";
import { brandEndSpokenLine, displayWebsiteHost, splitBrandDisplayLines } from "../brand.js";

describe("brand end card copy", () => {
  it("splits a Hebrew name with an English parenthetical onto two lines", () => {
    expect(splitBrandDisplayLines("מלון שאטו בנסקו (Chateau Bansko)")).toEqual([
      "מלון שאטו בנסקו",
      "Chateau Bansko"
    ]);
  });

  it("strips scheme and trailing slash from a website", () => {
    expect(displayWebsiteHost("https://kosher-bulgaria.com/")).toBe("kosher-bulgaria.com");
  });

  it("speaks the Hebrew name and a visit CTA without reading the URL", () => {
    expect(
      brandEndSpokenLine(
        {
          businessName: "מלון שאטו בנסקו (Chateau Bansko)",
          websiteUrl: "https://kosher-bulgaria.com/"
        },
        "he"
      )
    ).toBe("מלון שאטו בנסקו. בקרו באתר");
  });
});
