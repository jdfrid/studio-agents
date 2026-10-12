import { afterEach, describe, expect, it } from "vitest";
import { buildRunwayCreateBody, clampRunwayDuration } from "./runway.js";
import type { VideoBeatRequest } from "./index.js";

function beat(overrides: Partial<VideoBeatRequest> = {}): VideoBeatRequest {
  return { sceneId: "s1", prompt: "A barista pours latte art", durationSeconds: 6, aspectRatio: "9:16", ...overrides } as VideoBeatRequest;
}

describe("runway grok imagine request", () => {
  afterEach(() => {
    delete process.env.RUNWAY_VIDEO_RESOLUTION;
  });

  it("animates the scene still with image_to_video at 720p keeping the image aspect", () => {
    const { endpoint, body } = buildRunwayCreateBody(beat(), "grok_imagine_1_5_lite", "data:image/png;base64,AAAA");
    expect(endpoint).toBe("/v1/image_to_video");
    expect(body).toMatchObject({
      model: "grok_imagine_1_5_lite",
      promptImage: [{ uri: "data:image/png;base64,AAAA", position: "first" }],
      promptText: "A barista pours latte art",
      duration: 6,
      ratio: "auto_720p"
    });
  });

  it("falls back to text_to_video with a portrait ratio when no still exists", () => {
    process.env.RUNWAY_VIDEO_RESOLUTION = "480p";
    const { endpoint, body } = buildRunwayCreateBody(beat(), "grok_imagine_1_5_lite", null);
    expect(endpoint).toBe("/v1/text_to_video");
    expect(body.ratio).toBe("480:848");
    expect(buildRunwayCreateBody(beat({ aspectRatio: "16:9" })).body.ratio).toBe("848:480");
  });

  it("keeps durations inside Runway's 1–15 second window", () => {
    expect(clampRunwayDuration(0)).toBe(6);
    expect(clampRunwayDuration(0.6)).toBe(1);
    expect(clampRunwayDuration(6.4)).toBe(6);
    expect(clampRunwayDuration(40)).toBe(15);
    expect(clampRunwayDuration(Number.NaN)).toBe(6);
  });
});
