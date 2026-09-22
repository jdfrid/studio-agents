import { describe, expect, it } from "vitest";
import {
  BUSINESS_CREDITS,
  CHECKOUT_PLANS,
  CREDIT_CORRECTION_ASSET,
  CREDIT_CORRECTION_RENDER,
  CREDIT_LIP_SYNC_SURCHARGE,
  CREDIT_NEW_VIDEO,
  PAYG_CREDITS,
  PAYG_PRICE_NIS,
  PAYG_PRICE_USD,
  STARTER_CREDITS,
  briefRequestsLipSync,
  creditCostForVideo
} from "../index.js";

describe("credit catalog", () => {
  it("charges 40 credits for a standard video and 60 with lip-sync", () => {
    expect(CREDIT_NEW_VIDEO).toBe(40);
    expect(CREDIT_LIP_SYNC_SURCHARGE).toBe(20);
    expect(creditCostForVideo()).toBe(40);
    expect(creditCostForVideo({ preferLipSync: false })).toBe(40);
    expect(creditCostForVideo({ preferLipSync: true })).toBe(60);
  });

  it("uses whole-credit corrections", () => {
    expect(CREDIT_CORRECTION_ASSET).toBe(20);
    expect(CREDIT_CORRECTION_RENDER).toBe(10);
  });

  it("detects lip-sync from the brief creative flag", () => {
    expect(briefRequestsLipSync({ creative: { preferHeygenDub: "on" } })).toBe(true);
    expect(briefRequestsLipSync({ creative: { preferHeygenDub: "off" } })).toBe(false);
    expect(briefRequestsLipSync({})).toBe(false);
  });

  it("maps checkout plans to credit grants", () => {
    expect(CHECKOUT_PLANS.payg.credits).toBe(PAYG_CREDITS);
    expect(CHECKOUT_PLANS.starter.credits).toBe(STARTER_CREDITS);
    expect(CHECKOUT_PLANS.business.credits).toBe(BUSINESS_CREDITS);
    expect(PAYG_CREDITS).toBe(49);
    expect(STARTER_CREDITS).toBe(200);
    expect(BUSINESS_CREDITS).toBe(600);
    expect(CHECKOUT_PLANS.payg.priceNis).toBe(PAYG_PRICE_NIS);
    expect(CHECKOUT_PLANS.payg.priceUsd).toBe(PAYG_PRICE_USD);
    expect(PAYG_PRICE_USD).toBe(15);
  });
});
