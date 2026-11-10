export type NewRunQuote = {
  cost: number;
  /** This run should spend one goodwill free video, not the welcome allowance. */
  useGoodwill: boolean;
  paidCost: number;
};

/** Welcome allowance is spent by creating the run. Goodwill is a separate balance. */
export function quoteNewRunCost(input: {
  welcomeRemaining: number;
  goodwillFreeVideos: number;
  paidCost: number;
}): NewRunQuote {
  if (input.welcomeRemaining > 0) {
    return { cost: 0, useGoodwill: false, paidCost: input.paidCost };
  }
  if (input.goodwillFreeVideos > 0) {
    return { cost: 0, useGoodwill: true, paidCost: input.paidCost };
  }
  return { cost: input.paidCost, useGoodwill: false, paidCost: input.paidCost };
}
