import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { creemApiBase, creemSubscriptionState, planForCreemProduct, verifyCreemSignature } from "../creem.js";
import { addMonths, amountNisFromMinor, grantForPlan, monthlyGrantsDue, monthsPerBillingPeriod } from "../plans.js";

const ENV_KEYS = ["CREEM_WEBHOOK_SECRET", "CREEM_PRODUCT_PAYG", "CREEM_PRODUCT_MONTHLY", "CREEM_PRODUCT_YEARLY"];
const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

describe("plan grants", () => {
  it("maps checkout plans to credits and intervals", () => {
    expect(grantForPlan("payg")).toMatchObject({ credits: 40, interval: "once" });
    expect(grantForPlan("starter")).toMatchObject({ credits: 1200, interval: "month" });
    expect(grantForPlan("business")).toMatchObject({ credits: 1200, interval: "year" });
    expect(monthsPerBillingPeriod("year")).toBe(12);
    expect(monthsPerBillingPeriod("month")).toBe(1);
  });

  it("clamps month ends when adding months", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonths(new Date("2026-03-15T00:00:00Z"), 12).toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });

  it("drips yearly grants one per elapsed month", () => {
    const start = new Date("2026-01-10T00:00:00Z");
    const end = new Date("2027-01-10T00:00:00Z");
    expect(monthlyGrantsDue(start, end, new Date("2026-01-09T00:00:00Z"), 12)).toBe(0);
    expect(monthlyGrantsDue(start, end, start, 12)).toBe(1);
    expect(monthlyGrantsDue(start, end, new Date("2026-04-10T00:00:00Z"), 12)).toBe(4);
    expect(monthlyGrantsDue(start, end, new Date("2028-01-01T00:00:00Z"), 12)).toBe(12);
  });

  it("grants a monthly plan once per period", () => {
    const start = new Date("2026-01-10T00:00:00Z");
    const end = new Date("2026-02-10T00:00:00Z");
    expect(monthlyGrantsDue(start, end, new Date("2026-02-09T00:00:00Z"), 1)).toBe(1);
  });

  it("converts minor units to NIS with a plan fallback", () => {
    expect(amountNisFromMinor(0, "USD", "payg")).toBeGreaterThan(0);
    expect(amountNisFromMinor(1000, "ILS")).toBe(10);
  });
});

describe("creem helpers", () => {
  it("picks the sandbox for test keys", () => {
    expect(creemApiBase("creem_test_abc")).toBe("https://test-api.creem.io");
    expect(creemApiBase("creem_abc")).toBe("https://api.creem.io");
  });

  it("maps subscription statuses", () => {
    expect(creemSubscriptionState("active")).toBe("ACTIVE");
    expect(creemSubscriptionState("trialing")).toBe("ACTIVE");
    expect(creemSubscriptionState("scheduled_cancel")).toBe("CANCELLED");
    expect(creemSubscriptionState("canceled")).toBe("EXPIRED");
    expect(creemSubscriptionState("expired")).toBe("EXPIRED");
    expect(creemSubscriptionState("past_due")).toBe("PAST_DUE");
    expect(creemSubscriptionState("unpaid")).toBe("PAST_DUE");
  });

  it("resolves plans from product ids", () => {
    process.env.CREEM_PRODUCT_PAYG = "prod_a";
    process.env.CREEM_PRODUCT_MONTHLY = "prod_b";
    process.env.CREEM_PRODUCT_YEARLY = "prod_c";
    expect(planForCreemProduct("prod_a")).toBe("payg");
    expect(planForCreemProduct("prod_b")).toBe("starter");
    expect(planForCreemProduct("prod_c")).toBe("business");
    expect(planForCreemProduct("prod_x")).toBeNull();
    expect(planForCreemProduct(null)).toBeNull();
  });

  it("verifies HMAC-SHA256 webhook signatures", () => {
    process.env.CREEM_WEBHOOK_SECRET = "whsec_test";
    const body = JSON.stringify({ eventType: "checkout.completed" });
    const sig = createHmac("sha256", "whsec_test").update(body).digest("hex");
    expect(verifyCreemSignature(body, sig)).toBe(true);
    expect(verifyCreemSignature(body + " ", sig)).toBe(false);
    expect(verifyCreemSignature(body, undefined)).toBe(false);
    delete process.env.CREEM_WEBHOOK_SECRET;
    expect(verifyCreemSignature(body, sig)).toBe(false);
  });
});
