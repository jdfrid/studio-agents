import { afterEach, describe, expect, it } from "vitest";
import { extractLemonVariantId, grantForLemonVariant, orderAmountNis } from "../lemonPlans.js";

describe("Lemon plan grants", () => {
  const keys = [
    "LEMONSQUEEZY_VARIANT_PAYG",
    "LEMONSQUEEZY_VARIANT_STARTER",
    "LEMONSQUEEZY_VARIANT_BUSINESS",
    "LEMONSQUEEZY_VARIANT_PAYG_USD",
    "LEMONSQUEEZY_VARIANT_STARTER_USD",
    "LEMONSQUEEZY_VARIANT_BUSINESS_USD",
    "LEMONSQUEEZY_VARIANT_SUBSCRIPTION"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it("extracts variant ids from Lemon payloads", () => {
    expect(
      extractLemonVariantId({
        data: { attributes: { first_order_item: { variant_id: 11 } } }
      })
    ).toBe("11");
    expect(
      extractLemonVariantId({
        data: { attributes: { variant_id: "22" } }
      })
    ).toBe("22");
    expect(extractLemonVariantId({ data: { attributes: {} } })).toBeNull();
  });

  it("maps checkout variants to credit grants", () => {
    process.env.LEMONSQUEEZY_VARIANT_PAYG = "payg";
    process.env.LEMONSQUEEZY_VARIANT_STARTER = "starter";
    process.env.LEMONSQUEEZY_VARIANT_BUSINESS = "business";
    process.env.LEMONSQUEEZY_VARIANT_SUBSCRIPTION = "legacy";

    expect(grantForLemonVariant("payg", "order")).toEqual({
      planType: "PAYG",
      credits: 49,
      checkoutPlan: "payg",
      interval: "once"
    });
    expect(grantForLemonVariant("starter", "subscription")).toMatchObject({
      planType: "STARTER",
      credits: 200,
      interval: "month"
    });
    expect(grantForLemonVariant("business", "subscription")).toMatchObject({
      planType: "BUSINESS",
      credits: 600,
      interval: "month"
    });
    expect(grantForLemonVariant("legacy", "subscription")).toMatchObject({
      planType: "SUBSCRIPTION",
      credits: 1200,
      interval: "month"
    });
  });

  it("maps USD variants to the same credit grants", () => {
    process.env.LEMONSQUEEZY_VARIANT_PAYG_USD = "payg-usd";
    process.env.LEMONSQUEEZY_VARIANT_STARTER_USD = "starter-usd";
    process.env.LEMONSQUEEZY_VARIANT_BUSINESS_USD = "business-usd";
    expect(grantForLemonVariant("payg-usd", "order")).toMatchObject({
      planType: "PAYG",
      credits: 49,
      interval: "once"
    });
    expect(grantForLemonVariant("starter-usd", "subscription")).toMatchObject({
      planType: "STARTER",
      credits: 200,
      interval: "month"
    });
    expect(grantForLemonVariant("business-usd", "subscription")).toMatchObject({
      planType: "BUSINESS",
      credits: 600,
      interval: "month"
    });
  });

  it("converts USD order totals to NIS for admin P&L", () => {
    expect(orderAmountNis({ currency: "USD", total: 1500 }, "payg")).toBe(54);
    expect(orderAmountNis({ currency: "ILS", total: 4900 }, "payg")).toBe(49);
  });
});
