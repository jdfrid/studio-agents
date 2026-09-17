import { describe, expect, it } from "vitest";
import { consumeLimit } from "./rateLimit.js";

describe("consumeLimit", () => {
  it("blocks after the window fills", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(consumeLimit(key, 2, 60_000)).toBe(true);
    expect(consumeLimit(key, 2, 60_000)).toBe(true);
    expect(consumeLimit(key, 2, 60_000)).toBe(false);
  });
});
