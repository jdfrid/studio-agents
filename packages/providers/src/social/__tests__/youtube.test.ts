import { afterEach, describe, expect, it } from "vitest";
import { channelBrandingUpdate, createYoutubeAdapter, youtubeMetadata } from "../youtube.js";

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
      redirectUri: "https://reelmino.com/auth/google/callback",
      state: "st"
    });
    const params = new URL(authorizeUrl).searchParams;
    expect(params.get("prompt")).toBe("select_account consent");
  });

  it("keeps video keywords out of the description and on the tag list", () => {
    const { snippet } = youtubeMetadata({
      title: "Keep herbs alive",
      body: "Store the stems in water.\n\nA kitchen tip made with Reelmino.",
      hashtags: ["Reelmino", "video creation", "יצירת וידאו", "kitchen tips"],
      isShort: true
    });
    expect(snippet.description).toContain("Store the stems in water.");
    expect(snippet.description).toContain("#Shorts");
    expect(snippet.description).not.toContain("#יצירת");
    expect(snippet.tags).toContain("יצירת וידאו");
    expect(snippet.tags).toContain("video creation");
  });

  it("keeps a new upload private until the scheduled public time", () => {
    const release = new Date("2026-11-10T12:00:00.000Z");
    const { status } = youtubeMetadata({
      title: "One sentence becomes a video",
      body: "Write it once.",
      privacy: "public",
      scheduleAt: release.toISOString()
    });
    expect(status.privacyStatus).toBe("private");
    expect(status.publishAt).toBe(release.toISOString());
  });

  it("writes the channel description and keywords without dropping the trailer", () => {
    const payload = channelBrandingUpdate({
      channelId: "UC1",
      description: "Reelmino turns one sentence into a video.",
      keywords: '"video creation" "יצירת וידאו"',
      existing: { unsubscribedTrailer: "abc123", title: "Reelmino" }
    });
    expect(payload.id).toBe("UC1");
    expect(payload.brandingSettings.channel.description).toContain("Reelmino");
    expect(payload.brandingSettings.channel.keywords).toContain("יצירת וידאו");
    expect(payload.brandingSettings.channel.unsubscribedTrailer).toBe("abc123");
    expect(payload.brandingSettings.channel.title).toBeUndefined();
  });
});
