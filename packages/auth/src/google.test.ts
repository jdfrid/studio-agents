import { afterEach, describe, expect, it } from "vitest";
import { appUrl, googleRedirectUri } from "./google.js";

const original = process.env.APP_URL;

afterEach(() => {
  process.env.APP_URL = original;
});

describe("google oauth redirect", () => {
  it("uses APP_URL plus /auth/google/callback", () => {
    process.env.APP_URL = "https://reelmino.com";
    expect(appUrl()).toBe("https://reelmino.com");
    expect(googleRedirectUri()).toBe("https://reelmino.com/auth/google/callback");
  });

  it("strips a trailing slash from APP_URL", () => {
    process.env.APP_URL = "https://reelmino.com/";
    expect(googleRedirectUri()).toBe("https://reelmino.com/auth/google/callback");
  });
});
