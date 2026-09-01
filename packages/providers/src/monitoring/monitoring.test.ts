import { describe, expect, it } from "vitest";
import { calculateRunwayHours, officialBillingUrl, severityForReading } from "./index.js";

describe("provider monitoring", () => {
  it("calculates runway from remaining units and burn rate", () => {
    expect(calculateRunwayHours(80, 20, 2)).toBe(8);
    expect(calculateRunwayHours(null, 20, 2)).toBeNull();
    expect(calculateRunwayHours(80, 0, 2)).toBeNull();
  });

  it("prioritizes provider failures and critical thresholds", () => {
    expect(severityForReading({ healthy: false, value: null }, { warning: 20, critical: 10 })).toBe("CRITICAL");
    expect(severityForReading({ healthy: true, value: 8 }, { warning: 20, critical: 10 })).toBe("CRITICAL");
    expect(severityForReading({ healthy: true, value: 15 }, { warning: 20, critical: 10 })).toBe("WARNING");
    expect(severityForReading({ healthy: true, value: 30 }, { warning: 20, critical: 10 })).toBeNull();
  });

  it("only exposes fixed official billing links", () => {
    expect(officialBillingUrl("heygen")).toBe("https://app.heygen.com/settings/billing");
    expect(officialBillingUrl("unknown")).toBeNull();
  });
});
