import { describe, expect, it } from "vitest";
import type { ProviderAlert, ProviderMonitor } from "./api";
import { formatCurrency, localizedAlert, monitorRisk, providerLabel } from "./monitoringUi";

function monitor(overrides: Partial<ProviderMonitor> = {}): ProviderMonitor {
  return {
    id: "monitor-1",
    provider: "elevenlabs",
    displayName: "ElevenLabs",
    metricType: "QUOTA",
    unit: "characters",
    lastValue: null,
    lastCheckedAt: "2026-09-01T12:00:00Z",
    warningThreshold: null,
    criticalThreshold: null,
    estimatedRunwayHours: null,
    source: "official_api",
    sourceRealtime: true,
    lastErrorMessage: null,
    lastErrorCode: null,
    billingUrl: null,
    enabled: true,
    snapshots: [{ healthy: true, checkedAt: "2026-09-01T12:00:00Z", details: {}, errorCode: null, errorMessage: null }],
    ...overrides
  };
}

describe("mobile monitoring UI", () => {
  it("formats NIS and USD without changing the currency", () => {
    expect(formatCurrency(12.5, "ILS")).toContain("12.50");
    expect(formatCurrency(12.5, "USD")).toContain("12.50");
  });

  it("treats an optional unconfigured provider as inactive", () => {
    expect(
      monitorRisk(
        monitor({ snapshots: [{ healthy: true, checkedAt: "", details: { operationalStatus: "DISABLED" }, errorCode: null, errorMessage: null }] })
      ).label
    ).toBe("לא פעיל");
  });

  it("localizes legacy technical alerts from their error code", () => {
    const alert = {
      id: "alert-1",
      severity: "CRITICAL",
      status: "OPEN",
      title: "gcs: critical",
      message: "raw",
      recommendedAction: null,
      lastSeenAt: "2026-09-01T12:00:00Z",
      occurrenceCount: 1,
      metadata: { errorCode: "upload_permission_denied" },
      monitor: { provider: "gcs", displayName: "Google Cloud Storage" }
    } satisfies ProviderAlert;
    expect(localizedAlert(alert).message).toContain("להעלות קבצים");
    expect(providerLabel("gcs")).toBe("אחסון Google Cloud");
  });
});
