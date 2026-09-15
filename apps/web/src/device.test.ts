import { describe, expect, it } from "vitest";
import { isMobileDevice } from "./device.js";

describe("isMobileDevice", () => {
  it("detects iPhone and Android phones", () => {
    expect(isMobileDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).toBe(true);
    expect(
      isMobileDevice({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36"
      })
    ).toBe(true);
  });

  it("detects iPadOS that spoofs Macintosh", () => {
    expect(
      isMobileDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        maxTouchPoints: 5
      })
    ).toBe(true);
  });

  it("keeps desktop browsers on desktop even with a touch screen", () => {
    expect(
      isMobileDevice({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
        maxTouchPoints: 10,
        userAgentMobile: false
      })
    ).toBe(false);
  });

  it("trusts the Client Hints mobile flag", () => {
    expect(isMobileDevice({ userAgent: "Mozilla/5.0", userAgentMobile: true })).toBe(true);
  });
});
