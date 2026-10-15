import { describe, expect, it } from "vitest";
import {
  buildProviderInventory,
  calculateRunwayHours,
  officialBillingUrl,
  parseHeygenBilling,
  parseRunwayOrganization,
  providerNameHe,
  severityForReading
} from "./index.js";
import { capacityRequirementsForRun, evaluateReadingCapacity, videoProviderForProfile } from "./capacity.js";

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
    expect(providerNameHe("api")).toContain("תשתית Reelmino");
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
    expect(inventory.some((entry) => entry.provider === "creem")).toBe(false);
  });

  it("attributes Runway Grok Imagine usage to Runway, not xAI", () => {
    const inventory = buildProviderInventory(
      [],
      [{ activityType: "veo_video", model: "grok_imagine_1_5_lite", metadata: { provider: "runway" } }],
      {}
    );
    expect(inventory.map((entry) => entry.provider)).toEqual(["runway"]);
  });

  it("converts the Runway credit balance to dollars and keeps daily limits", () => {
    const parsed = parseRunwayOrganization({
      creditBalance: 1250,
      tier: { maxMonthlyCreditSpend: 100000, models: { grok_imagine_1_5_lite: { maxDailyGenerations: 500, maxConcurrentGenerations: 3 } } },
      usage: { models: { grok_imagine_1_5_lite: { dailyGenerations: 12 }, gen4_turbo: { dailyGenerations: 3 } } }
    });
    expect(parsed.value).toBe(12.5);
    expect(parsed.details).toMatchObject({
      creditBalance: 1250,
      dailyGenerations: 15,
      grokDailyGenerations: 12,
      grokMaxDailyGenerations: 500,
      grokMaxConcurrentGenerations: 3
    });
    expect(parseRunwayOrganization({}).value).toBeNull();
  });
});

describe("run capacity pre-flight", () => {
  const base = { operationalStatus: "HEALTHY" as const, source: "official_api", metricType: "BALANCE" as const, unit: "USD" };

  it("blocks when a USD balance cannot cover the video", () => {
    expect(evaluateReadingCapacity({ ...base, value: 0.5 }, 0.9)).toBe("no_funds");
    expect(evaluateReadingCapacity({ ...base, value: 5 }, 0.9)).toBeNull();
  });

  it("blocks empty credit quotas, missing keys and rejected keys", () => {
    expect(evaluateReadingCapacity({ ...base, metricType: "QUOTA", unit: "credits", value: 0 })).toBe("no_funds");
    expect(evaluateReadingCapacity({ ...base, metricType: "QUOTA", unit: "credits", value: 3 })).toBeNull();
    expect(evaluateReadingCapacity({ ...base, value: null, operationalStatus: "DISABLED", source: "optional_not_configured" })).toBe(
      "not_configured"
    );
    expect(evaluateReadingCapacity({ ...base, value: null, errorCode: "http_401" })).toBe("auth");
    expect(evaluateReadingCapacity({ ...base, value: null, errorCode: "http_402" })).toBe("no_funds");
  });

  it("does not block on health-only providers or transient outages", () => {
    expect(evaluateReadingCapacity({ ...base, metricType: "SERVICE_HEALTH", value: null })).toBeNull();
    expect(evaluateReadingCapacity({ ...base, value: null, errorCode: "http_503" })).toBeNull();
  });

  it("requires the profile's video provider plus Gemini", () => {
    expect(videoProviderForProfile("runway-grok-lite")).toBe("runway");
    expect(videoProviderForProfile("kling-avatar-i2v")).toBe("fal");
    expect(videoProviderForProfile("omni-multiclip")).toBe("gemini");
    const reqs = capacityRequirementsForRun("runway-grok-lite", 30);
    expect(reqs.map((r) => r.provider)).toEqual(["runway", "gemini"]);
    expect(reqs[0]?.requiredUsd).toBeCloseTo(0.9);
  });
});
