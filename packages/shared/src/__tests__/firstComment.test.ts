import { describe, expect, it } from "vitest";
import { NETWORK_CAPABILITIES } from "../social/capabilities.js";
import {
  composeFirstComment,
  firstCommentDelayMs,
  networkSupportsFirstComment,
  planFirstComment
} from "../social/firstComment.js";
import { previewTransform } from "../social/transform.js";

describe("first comment helpers", () => {
  it("enables first comments on facebook, instagram, x and linkedin", () => {
    expect(networkSupportsFirstComment("facebook")).toBe(true);
    expect(networkSupportsFirstComment("instagram")).toBe(true);
    expect(networkSupportsFirstComment("x")).toBe(true);
    expect(networkSupportsFirstComment("linkedin")).toBe(true);
    expect(networkSupportsFirstComment("youtube")).toBe(false);
    expect(NETWORK_CAPABILITIES.facebook.features.firstComment).toBe(true);
  });

  it("defaults delay to two minutes and clamps the range", () => {
    expect(firstCommentDelayMs()).toBe(2 * 60_000);
    expect(firstCommentDelayMs({ firstCommentDelayMinutes: 0 })).toBe(0);
    expect(firstCommentDelayMs({ firstCommentDelayMinutes: 120 })).toBe(120 * 60_000);
    expect(firstCommentDelayMs({ firstCommentDelayMinutes: 999 })).toBe(120 * 60_000);
  });

  it("parks a link in the comment and plans a delayed post", () => {
    expect(composeFirstComment({ firstComment: "More here", link: "https://reelmino.com/?utm=1", linkInFirstComment: true })).toContain(
      "https://reelmino.com/?utm=1"
    );
    const planned = planFirstComment({ text: " https://reelmino.com ", delayMinutes: 3, now: new Date("2026-10-26T12:00:00Z") });
    expect(planned).toMatchObject({
      text: "https://reelmino.com",
      delayMinutes: 3,
      at: "2026-10-26T12:03:00.000Z",
      status: "pending"
    });
    expect(planFirstComment({ text: "  " })).toBeNull();
  });

  it("omits the link from the caption when it is reserved for the first comment", () => {
    const preview = previewTransform(
      [],
      { body: "See the workflow", link: "https://reelmino.com/?utm_source=instagram", hashtags: [] },
      NETWORK_CAPABILITIES.instagram,
      { linkInFirstComment: true }
    );
    expect(preview.nativeCopy.caption).toBe("See the workflow");
    expect(preview.nativeCopy.firstComment).toBe("https://reelmino.com/?utm_source=instagram");
  });
});
