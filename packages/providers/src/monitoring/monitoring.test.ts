import { describe, expect, it } from "vitest";
import {
  buildProviderInventory,
  calculateRunwayHours,
  officialBillingUrl,
  parseHeygenBilling,
  providerNameHe,
  severityForReading
} from "./index.js";

describe("provider monitoring", () => {
  it("calculates runway from remaining units and burn rate", () => {
    expect(calculateRunwayHours(80, 20, 2)).toBe(8);
    expect(calculateRunwayHours(null, 20, 2)).toBeNull();
    expect(calculateRunwayHours(80, 0, 2)).toBeNull();
  });

  it("prioritizes provider failures and critical thresholds", () => {
    expect(severityForReading({ healthy: false, value: null }, { warning: 20, critical: 10 })).toBe(
      "CRITICAL"
    );
    expect(severityForReading({ healthy: true, value: 8 }, { warning: 20, critical: 10 })).toBe("CRITICAL");
    expect(severityForReading({ healthy: true, value: 15 }, { warning: 20, critical: 10 })).toBe("WARNING");
    expect(severityForReading({ healthy: true, value: 30 }, { warning: 20, critical: 10 })).toBeNull();
    expect(
      severityForReading(
        { healthy: true, value: null, operationalStatus: "DISABLED" },
        { warning: 20, critical: 10 }
      )
    ).toBeNull();
    expect(
      severityForReading(
        { healthy: false, value: null, operationalStatus: "NOT_CONFIGURED" },
        { warning: 20, critical: 10 }
      )
    ).toBe("CRITICAL");
  });

  it("only exposes fixed official billing links", () => {
    expect(officialBillingUrl("heygen")).toBe("https://app.heygen.com/settings/billing");
    expect(officialBillingUrl("unknown")).toBeNull();
  });

  it("uses clear Hebrew provider names", () => {
    expect(providerNameHe("gcs")).toBe("Google Cloud Storage");
    expect(providerNameHe("api")).toContain("תשתית Prompt2Spot");
  });

  it("distinguishes HeyGen wallet money from subscription credits", () => {
    expect(
      parseHeygenBilling({
        data: { billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 42.5 } }
      })
    ).toMatchObject({ metricType: "BALANCE", value: 42.5, unit: "USD" });
    expect(
      parseHeygenBilling({
        data: {
          billing_type: "subscription",
          subscription: { credits: { premium_credits: { remaining: 10 }, add_on_credits: { remaining: 2 } } }
        }
      })
    ).toMatchObject({ metricType: "QUOTA", value: 12, unit: "credits" });
  });

  it("builds a deterministic inventory from env, DB credentials and recent usage", () => {
    const inventory = buildProviderInventory(
      [{ provider: "Anthropic", displayName: "Claude", enabled: true, encryptedKey: "encrypted" }],
      [
        { activityType: "veo_video", model: "fal-ai/kling-video", metadata: {} },
        { activityType: "gemini_text", model: "gemini-2.5-pro", metadata: {} }
      ],
      { ELEVENLABS_API_KEY: "configured" }
    );
    expect(inventory.map((entry) => entry.provider)).toEqual(["gemini", "fal", "elevenlabs", "anthropic"]);
    expect(inventory.find((entry) => entry.provider === "fal")).toMatchObject({
      configured: false,
      expectedFromRecentUsage: true
    });
    expect(inventory.some((entry) => entry.provider === "lemonsqueezy")).toBe(false);
  });
});
