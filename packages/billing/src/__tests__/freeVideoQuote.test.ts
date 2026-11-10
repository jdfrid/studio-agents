import { describe, expect, it } from "vitest";
import { quoteNewRunCost } from "../freeVideoQuote.js";

describe("quoteNewRunCost", () => {
  it("uses the welcome allowance before goodwill", () => {
    expect(quoteNewRunCost({ welcomeRemaining: 1, goodwillFreeVideos: 2, paidCost: 40 })).toEqual({
      cost: 0,
      useGoodwill: false,
      paidCost: 40
    });
  });

  it("spends one goodwill video when the welcome allowance is gone", () => {
    expect(quoteNewRunCost({ welcomeRemaining: 0, goodwillFreeVideos: 1, paidCost: 40 })).toEqual({
      cost: 0,
      useGoodwill: true,
      paidCost: 40
    });
  });

  it("charges when neither free balance remains", () => {
    expect(quoteNewRunCost({ welcomeRemaining: 0, goodwillFreeVideos: 0, paidCost: 60 })).toEqual({
      cost: 60,
      useGoodwill: false,
      paidCost: 60
    });
  });
});
