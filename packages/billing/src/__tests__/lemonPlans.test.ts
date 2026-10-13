import { afterEach, describe, expect, it } from "vitest";
import {
  addMonths,
  extractLemonVariantId,
  grantForLemonVariant,
  monthlyGrantsDue,
  orderAmountNis,
  subscriptionStatusFromLemon
} from "../lemonPlans.js";

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
      credits: 40,
      checkoutPlan: "payg",
      interval: "once"
    });
    expect(grantForLemonVariant("starter", "subscription")).toMatchObject({
      planType: "STARTER",
      credits: 1200,
      interval: "month"
    });
    expect(grantForLemonVariant("business", "subscription")).toMatchObject({
      planType: "BUSINESS",
      credits: 1200,
      interval: "year"
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
      credits: 40,
      interval: "once"
    });
    expect(grantForLemonVariant("starter-usd", "subscription")).toMatchObject({
      planType: "STARTER",
      credits: 1200,
      interval: "month"
    });
    expect(grantForLemonVariant("business-usd", "subscription")).toMatchObject({
      planType: "BUSINESS",
      credits: 1200,
      interval: "year"
    });
  });

  it("converts USD order totals to NIS for admin P&L", () => {
    expect(orderAmountNis({ currency: "USD", total: 1500 }, "payg")).toBe(54);
    expect(orderAmountNis({ currency: "ILS", total: 4900 }, "payg")).toBe(49);
  });
});

describe("subscription period math", () => {
  it("adds calendar months and clamps to the month end", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonths(new Date("2026-03-15T00:00:00Z"), -12).toISOString()).toBe("2025-03-15T00:00:00.000Z");
  });

  it("owes one grant per started month of a yearly period, never more than 12", () => {
    const start = new Date("2026-01-10T12:00:00Z");
    const end = addMonths(start, 12);
    expect(monthlyGrantsDue(start, end, new Date("2026-01-10T12:00:00Z"), 12)).toBe(1);
    expect(monthlyGrantsDue(start, end, new Date("2026-02-10T11:59:00Z"), 12)).toBe(1);
    expect(monthlyGrantsDue(start, end, new Date("2026-02-10T12:00:00Z"), 12)).toBe(2);
    expect(monthlyGrantsDue(start, end, new Date("2026-12-31T00:00:00Z"), 12)).toBe(12);
    expect(monthlyGrantsDue(start, end, new Date("2027-06-01T00:00:00Z"), 12)).toBe(12);
    expect(monthlyGrantsDue(start, end, new Date("2025-12-01T00:00:00Z"), 12)).toBe(0);
  });

  it("owes exactly one grant per monthly period", () => {
    const start = new Date("2026-01-10T12:00:00Z");
    expect(monthlyGrantsDue(start, addMonths(start, 1), new Date("2026-01-20T00:00:00Z"), 1)).toBe(1);
  });

  it("maps Lemon subscription statuses", () => {
    expect(subscriptionStatusFromLemon("active")).toBe("ACTIVE");
    expect(subscriptionStatusFromLemon("on_trial")).toBe("ACTIVE");
    expect(subscriptionStatusFromLemon("past_due")).toBe("PAST_DUE");
    expect(subscriptionStatusFromLemon("cancelled")).toBe("CANCELLED");
    expect(subscriptionStatusFromLemon("expired")).toBe("EXPIRED");
  });
});
