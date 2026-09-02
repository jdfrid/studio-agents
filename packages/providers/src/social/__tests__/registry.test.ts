import { describe, expect, it } from "vitest";
import { listNetworkAdapters, listNetworkPublicViews, getNetworkAdapter } from "../registry.js";

describe("social adapter registry", () => {
  it("registers all six networks", () => {
    const networks = listNetworkAdapters().map((adapter) => adapter.network).sort();
    expect(networks).toEqual(["facebook", "instagram", "telegram", "tiktok", "x", "youtube"]);
  });

  it("exposes capability manifests", () => {
    for (const adapter of listNetworkAdapters()) {
      expect(adapter.capabilities.media.length).toBeGreaterThan(0);
      expect(adapter.capabilities.publishProtocol).toBeTruthy();
      expect(typeof adapter.publish).toBe("function");
      expect(typeof adapter.listDestinations).toBe("function");
    }
  });

  it("marks Telegram as always configured (bot token per connection)", () => {
    const telegram = listNetworkPublicViews().find((view) => view.network === "telegram");
    expect(telegram?.configured).toBe(true);
    expect(telegram?.authKind).toBe("bot_token");
  });

  it("previews through the adapter using shared transform", () => {
    const preview = getNetworkAdapter("youtube").preview(
      [{ kind: "image", gcsPath: "a.jpg", mimeType: "image/jpeg" }],
      { title: "nope", hashtags: [] }
    );
    expect(preview.accepted).toBe(false);
  });
});
