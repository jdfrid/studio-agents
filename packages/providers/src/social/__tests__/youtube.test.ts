import { afterEach, describe, expect, it } from "vitest";
import { createYoutubeAdapter } from "../youtube.js";

describe("youtube adapter", () => {
  const prevId = process.env.GOOGLE_CLIENT_ID;
  const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
  const prevYtId = process.env.YOUTUBE_CLIENT_ID;
  const prevYtSecret = process.env.YOUTUBE_CLIENT_SECRET;

  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = prevId;
    process.env.GOOGLE_CLIENT_SECRET = prevSecret;
    process.env.YOUTUBE_CLIENT_ID = prevYtId;
    process.env.YOUTUBE_CLIENT_SECRET = prevYtSecret;
  });

  it("asks Google to pick an account so a Brand channel can be connected", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;

    const { authorizeUrl } = await createYoutubeAdapter().startOAuth!({
      redirectUri: "https://prompt2spot.com/auth/google/callback",
      state: "st"
    });
    const params = new URL(authorizeUrl).searchParams;
    expect(params.get("prompt")).toBe("select_account consent");
  });
});
