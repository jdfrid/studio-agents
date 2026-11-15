import { describe, expect, it } from "vitest";
import {
  capacityAlertCopy,
  capacityStopsProduction,
  meterVideos,
  NARRATION_CHARS_PER_STANDARD_VIDEO,
  productionBlockedNotice
} from "../serviceCapacity.js";

describe("meterVideos", () => {
  it("counts 30-second videos from a USD balance", () => {
    const meter = meterVideos({ balance: 15.32, unit: "USD", usdPerSecond: 0.02 });
    expect(meter.videoSeconds).toBe(30);
    expect(meter.costPerVideoUsd).toBe(0.6);
    expect(meter.videosRemaining).toBe(25);
    expect(meter.kind).toBe("videos");
  });

  it("is empty when the balance cannot cover one video", () => {
    expect(meterVideos({ balance: 0.4, unit: "USD", usdPerSecond: 0.02 }).videosRemaining).toBe(0);
  });

  it("counts narration videos from a character quota", () => {
    const meter = meterVideos({ balance: NARRATION_CHARS_PER_STANDARD_VIDEO * 2 + 10, unit: "characters", usdPerSecond: null });
    expect(meter.kind).toBe("narration");
    expect(meter.videosRemaining).toBe(2);
  });

  it("does not invent a count when the provider reports no balance", () => {
    expect(meterVideos({ balance: null, unit: null, usdPerSecond: 0.08 }).kind).toBe("unknown");
    expect(meterVideos({ balance: null, unit: null, usdPerSecond: 0.08 }).videosRemaining).toBeNull();
  });

  it("mails when the active video service cannot cover another few videos", () => {
    expect(
      capacityStopsProduction({ kind: "videos", videosRemaining: 0, billingFailure: false, requiredForActiveVideo: true })
    ).toBe(true);
    expect(
      capacityStopsProduction({ kind: "videos", videosRemaining: 25, billingFailure: false, requiredForActiveVideo: true })
    ).toBe(false);
    expect(
      capacityStopsProduction({ kind: "unknown", videosRemaining: null, billingFailure: true, requiredForActiveVideo: true })
    ).toBe(true);
  });

  it("puts the payment link in the alert", () => {
    const alert = capacityAlertCopy({
      providerName: "HeyGen",
      videosRemaining: 0,
      videoSeconds: 30,
      costPerVideoUsd: 0.6,
      balanceLabel: "$0.40",
      billingUrl: "https://app.heygen.com/settings/billing",
      billingFailure: false
    });
    expect(alert.subject).toContain("אי אפשר להפיק");
    expect(alert.text).toContain("https://app.heygen.com/settings/billing");
    expect(alert.text).toContain("30");
  });

  it("tells the customer the model is disconnected instead of blaming load", () => {
    const notice = productionBlockedNotice({
      modelLabel: "Runway — Grok Imagine 1.5 Lite",
      providerName: "Runway",
      reason: "not_configured",
      adminUrl: "https://admin.reelmino.com"
    });
    expect(notice.customerHe).toContain("Runway — Grok Imagine 1.5 Lite");
    expect(notice.customerHe).toContain("לא מחובר");
    expect(notice.customerHe).toContain("לא תקלת עומס");
    expect(notice.text).toContain("https://admin.reelmino.com");
    expect(notice.subject).toContain("אי אפשר להפיק");
  });
});