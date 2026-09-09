export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.LEMONSQUEEZY_API_KEY &&
      process.env.LEMONSQUEEZY_STORE_ID &&
      process.env.LEMONSQUEEZY_VARIANT_PAYG &&
      process.env.LEMONSQUEEZY_VARIANT_SUBSCRIPTION
  );
}

/** Online Lemon Squeezy checkout. Set PAYMENTS_ENABLED=0 to pause. */
export function isCheckoutEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED !== "0" && isBillingConfigured();
}
