import { afterEach, describe, expect, it } from "vitest";
import { configuredCheckoutPlans, isCheckoutEnabled, isCheckoutPlanEnabled } from "../payments.js";

describe("isCheckoutEnabled", () => {
  const keys = [
    "PAYMENTS_ENABLED",
    "LEMONSQUEEZY_API_KEY",
    "LEMONSQUEEZY_STORE_ID",
    "LEMONSQUEEZY_STORE_ID_USD",
    "LEMONSQUEEZY_VARIANT_PAYG",
    "LEMONSQUEEZY_VARIANT_STARTER",
    "LEMONSQUEEZY_VARIANT_BUSINESS",
    "LEMONSQUEEZY_VARIANT_PAYG_USD",
    "LEMONSQUEEZY_VARIANT_STARTER_USD",
    "LEMONSQUEEZY_VARIANT_BUSINESS_USD"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  function setLemonKeys() {
    process.env.LEMONSQUEEZY_API_KEY = "key";
    process.env.LEMONSQUEEZY_STORE_ID = "1";
    process.env.LEMONSQUEEZY_VARIANT_PAYG = "2";
    process.env.LEMONSQUEEZY_VARIANT_STARTER = "3";
    process.env.LEMONSQUEEZY_VARIANT_BUSINESS = "4";
  }

  it("is on when Lemon Squeezy is configured", () => {
    setLemonKeys();
    delete process.env.PAYMENTS_ENABLED;
    expect(isCheckoutEnabled()).toBe(true);
  });

  it("stays on when PAYMENTS_ENABLED=1", () => {
    setLemonKeys();
    process.env.PAYMENTS_ENABLED = "1";
    expect(isCheckoutEnabled()).toBe(true);
  });

  it("turns off when PAYMENTS_ENABLED=0", () => {
    setLemonKeys();
    process.env.PAYMENTS_ENABLED = "0";
    expect(isCheckoutEnabled()).toBe(false);
  });

  it("is off when Lemon keys are missing", () => {
    delete process.env.PAYMENTS_ENABLED;
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.LEMONSQUEEZY_STORE_ID;
    delete process.env.LEMONSQUEEZY_VARIANT_PAYG;
    delete process.env.LEMONSQUEEZY_VARIANT_STARTER;
    delete process.env.LEMONSQUEEZY_VARIANT_BUSINESS;
    expect(isCheckoutEnabled()).toBe(false);
  });

  it("enables checkout when only the PAYG variant is set", () => {
    delete process.env.PAYMENTS_ENABLED;
    process.env.LEMONSQUEEZY_API_KEY = "key";
    process.env.LEMONSQUEEZY_STORE_ID = "1";
    process.env.LEMONSQUEEZY_VARIANT_PAYG = "2";
    delete process.env.LEMONSQUEEZY_VARIANT_STARTER;
    delete process.env.LEMONSQUEEZY_VARIANT_BUSINESS;
    expect(isCheckoutEnabled()).toBe(true);
    expect(configuredCheckoutPlans()).toEqual(["payg"]);
    expect(isCheckoutPlanEnabled("payg")).toBe(true);
    expect(isCheckoutPlanEnabled("starter")).toBe(false);
    expect(isCheckoutPlanEnabled("business")).toBe(false);
  });

  it("keeps ILS and USD plans independent", () => {
    delete process.env.PAYMENTS_ENABLED;
    process.env.LEMONSQUEEZY_API_KEY = "key";
    process.env.LEMONSQUEEZY_STORE_ID = "1";
    process.env.LEMONSQUEEZY_VARIANT_PAYG = "2";
    delete process.env.LEMONSQUEEZY_VARIANT_STARTER;
    delete process.env.LEMONSQUEEZY_VARIANT_BUSINESS;
    process.env.LEMONSQUEEZY_STORE_ID_USD = "9";
    process.env.LEMONSQUEEZY_VARIANT_PAYG_USD = "15";
    delete process.env.LEMONSQUEEZY_VARIANT_STARTER_USD;
    delete process.env.LEMONSQUEEZY_VARIANT_BUSINESS_USD;
    expect(isCheckoutEnabled()).toBe(true);
    expect(configuredCheckoutPlans("ils")).toEqual(["payg"]);
    expect(configuredCheckoutPlans("usd")).toEqual(["payg"]);
    expect(isCheckoutPlanEnabled("payg", "usd")).toBe(true);
    expect(isCheckoutPlanEnabled("starter", "usd")).toBe(false);
  });

  it("does not enable USD checkout when the USD store is missing", () => {
    setLemonKeys();
    delete process.env.LEMONSQUEEZY_STORE_ID_USD;
    process.env.LEMONSQUEEZY_VARIANT_PAYG_USD = "15";
    expect(configuredCheckoutPlans("usd")).toEqual([]);
    expect(isCheckoutPlanEnabled("payg", "usd")).toBe(false);
    expect(isCheckoutPlanEnabled("payg", "ils")).toBe(true);
  });
});
