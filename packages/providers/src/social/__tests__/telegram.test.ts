import { describe, expect, it, vi, beforeEach } from "vitest";
import { createTelegramAdapter } from "../telegram.js";
import * as http from "../http.js";

vi.mock("../http.js", async () => {
  const actual = await vi.importActual<typeof import("../http.js")>("../http.js");
  return { ...actual, socialJson: vi.fn() };
});

const socialJson = vi.mocked(http.socialJson);

describe("telegram adapter", () => {
  beforeEach(() => {
    socialJson.mockReset();
  });

  it("identifies the bot via getMe", async () => {
    socialJson.mockResolvedValueOnce({ ok: true, result: { id: 99, username: "studio_bot", first_name: "Studio" } });
    const identity = await createTelegramAdapter().identify!({ accessToken: "123:abc", botToken: "123:abc" });
    expect(identity.externalUserId).toBe("99");
    expect(identity.handle).toBe("@studio_bot");
  });

  it("sends a text message when there is no media", async () => {
    socialJson.mockResolvedValueOnce({ ok: true, result: { message_id: 7 } });
    const adapter = createTelegramAdapter();
    const preview = adapter.preview([], { body: "hello", hashtags: [] });
    const result = await adapter.publish({
      tokens: { accessToken: "123:abc", botToken: "123:abc" },
      destination: { id: "d", kind: "channel", externalId: "-1001", name: "News", config: {} },
      copy: { body: "hello", hashtags: [] },
      preview,
      media: [],
      mode: "now"
    });
    expect(result.status).toBe("published");
    expect(result.remotePostId).toBe("7");
    expect(socialJson).toHaveBeenCalled();
  });
});
