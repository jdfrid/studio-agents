import { describe, expect, it } from "vitest";
import {
  buildHeygenVideoCreateBody,
  clampHeygenVideoDuration
} from "../heygen.js";
import type { VideoBeatRequest } from "../types.js";

function req(partial: Partial<VideoBeatRequest> = {}): VideoBeatRequest {
  return {
    sceneId: "scene-1",
    prompt: "A barista pours a slow latte, locked camera.",
    aspectRatio: "9:16",
    durationBucket: "6",
    durationSeconds: 6,
    narrationText: "הבוקר מתחיל כאן.",
    ...partial
  };
}

describe("HeyGen Video request builder", () => {
  it("clamps duration to the 5–15s API range", () => {
    expect(clampHeygenVideoDuration(4)).toBe(5);
    expect(clampHeygenVideoDuration(6)).toBe(6);
    expect(clampHeygenVideoDuration(20)).toBe(15);
  });

  it("uses text_to_video when there is no still", () => {
    const body = buildHeygenVideoCreateBody(req());
    expect(body.model).toBe("heygen-video-1");
    expect(body.mode).toBe("text_to_video");
    expect(body.aspect_ratio).toBe("9:16");
    expect(String(body.prompt)).toContain("הבוקר מתחיל כאן");
    expect(body.image).toBeUndefined();
  });

  it("uses image_to_video when a still asset is present", () => {
    const body = buildHeygenVideoCreateBody(req({ aspectRatio: "16:9" }), "asset-123");
    expect(body.mode).toBe("image_to_video");
    expect(body.image).toEqual({ type: "asset_id", asset_id: "asset-123" });
    expect(body.aspect_ratio).toBeUndefined();
  });
});
