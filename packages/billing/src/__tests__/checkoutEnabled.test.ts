import { afterEach, describe, expect, it } from "vitest";
import { isCheckoutEnabled } from "../payments.js";

describe("isCheckoutEnabled", () => {
  const keys = [
    "PAYMENTS_ENABLED",
    "LEMONSQUEEZY_API_KEY",
    "LEMONSQUEEZY_STORE_ID",
    "LEMONSQUEEZY_VARIANT_PAYG",
    "LEMONSQUEEZY_VARIANT_SUBSCRIPTION"
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
    process.env.LEMONSQUEEZY_VARIANT_SUBSCRIPTION = "3";
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
    delete process.env.LEMONSQUEEZY_VARIANT_SUBSCRIPTION;
    expect(isCheckoutEnabled()).toBe(false);
  });
});
