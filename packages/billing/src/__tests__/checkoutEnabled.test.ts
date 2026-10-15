import { afterEach, describe, expect, it } from "vitest";
import { configuredCheckoutPlans, isCheckoutEnabled, isCheckoutPlanEnabled } from "../payments.js";

describe("isCheckoutEnabled", () => {
  const keys = [
    "PAYMENTS_ENABLED",
    "CREEM_API_KEY",
    "CREEM_PRODUCT_PAYG",
    "CREEM_PRODUCT_MONTHLY",
    "CREEM_PRODUCT_YEARLY"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  function setCreemKeys() {
    process.env.CREEM_API_KEY = "creem_test_key";
    process.env.CREEM_PRODUCT_PAYG = "prod_payg";
    process.env.CREEM_PRODUCT_MONTHLY = "prod_month";
    process.env.CREEM_PRODUCT_YEARLY = "prod_year";
  }

  it("is on when Creem is configured", () => {
    setCreemKeys();
    delete process.env.PAYMENTS_ENABLED;
    expect(isCheckoutEnabled()).toBe(true);
    expect(configuredCheckoutPlans()).toEqual(["payg", "starter", "business"]);
  });

  it("turns off when PAYMENTS_ENABLED=0", () => {
    setCreemKeys();
    process.env.PAYMENTS_ENABLED = "0";
    expect(isCheckoutEnabled()).toBe(false);
    expect(isCheckoutPlanEnabled("payg")).toBe(false);
  });

  it("is off without an API key even when products are set", () => {
    setCreemKeys();
    delete process.env.CREEM_API_KEY;
    delete process.env.PAYMENTS_ENABLED;
    expect(isCheckoutEnabled()).toBe(false);
    expect(configuredCheckoutPlans()).toEqual([]);
  });

  it("enables only the plans that have a product", () => {
    delete process.env.PAYMENTS_ENABLED;
    process.env.CREEM_API_KEY = "creem_test_key";
    process.env.CREEM_PRODUCT_PAYG = "prod_payg";
    delete process.env.CREEM_PRODUCT_MONTHLY;
    delete process.env.CREEM_PRODUCT_YEARLY;
    expect(configuredCheckoutPlans()).toEqual(["payg"]);
    expect(isCheckoutPlanEnabled("payg")).toBe(true);
    expect(isCheckoutPlanEnabled("starter")).toBe(false);
    expect(isCheckoutPlanEnabled("business")).toBe(false);
  });

  it("offers the same plans for both currencies", () => {
    setCreemKeys();
    delete process.env.PAYMENTS_ENABLED;
    expect(configuredCheckoutPlans("ils")).toEqual(configuredCheckoutPlans("usd"));
  });
});
