import { describe, expect, it } from "vitest";
import { NETWORK_CAPABILITIES } from "../social/capabilities.js";
import { previewTransform } from "../social/transform.js";
import type { PackageMediaItem } from "../social/schemas.js";

const verticalVideo: PackageMediaItem = {
  kind: "video",
  gcsPath: "runs/x/final.mp4",
  mimeType: "video/mp4",
  width: 1080,
  height: 1920,
  durationMs: 28_000,
  sizeBytes: 4_000_000
};

describe("previewTransform", () => {
  it("truncates Telegram captions at 1024 and flags lossy when a large share is cut", () => {
    const body = "x".repeat(1800);
    const preview = previewTransform([verticalVideo], { body, hashtags: [] }, NETWORK_CAPABILITIES.telegram);
    expect(preview.accepted).toBe(true);
    expect(preview.nativeCopy.caption?.length).toBeLessThanOrEqual(1024);
    expect(preview.lossy).toBe(true);
    expect(preview.changes.some((c) => c.field === "caption")).toBe(true);
  });

  it("rejects YouTube packages that are image-only", () => {
    const preview = previewTransform(
      [{ kind: "image", gcsPath: "img.jpg", mimeType: "image/jpeg" }],
      { title: "Hi", hashtags: [] },
      NETWORK_CAPABILITIES.youtube
    );
    expect(preview.accepted).toBe(false);
    expect(preview.errors).toContain("unsupported_media");
  });

  it("marks TikTok landscape video as lossy aspect mismatch", () => {
    const preview = previewTransform(
      [{ ...verticalVideo, width: 1920, height: 1080 }],
      { title: "Clip", body: "hello", hashtags: ["ad"] },
      NETWORK_CAPABILITIES.tiktok
    );
    expect(preview.accepted).toBe(true);
    expect(preview.lossy).toBe(true);
    expect(preview.warnings.some((w) => w.includes("aspect"))).toBe(true);
  });

  it("detects YouTube Shorts from vertical video under 60s", () => {
    const preview = previewTransform(
      [verticalVideo],
      { title: "My short", hashtags: [] },
      NETWORK_CAPABILITIES.youtube
    );
    expect(preview.nativeCopy.isShort).toBe(true);
    expect(preview.nativeCopy.title).toBe("My short");
  });

  it("allows text-only Telegram posts", () => {
    const preview = previewTransform([], { body: "hello channel", hashtags: [] }, NETWORK_CAPABILITIES.telegram);
    expect(preview.accepted).toBe(true);
    expect(preview.selectedMedia).toBeNull();
    expect(preview.nativeCopy.caption).toContain("hello channel");
  });
});
