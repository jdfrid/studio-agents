import { describe, expect, it } from "vitest";
import { normalizeOperation } from "../video.js";

describe("normalizeOperation", () => {
  it("parses predictLongRunning generateVideoResponse payloads", () => {
    const result = normalizeOperation("models/veo-3.1-generate-preview/operations/op1", "veo-3.1-generate-preview", {
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [
            {
              video: {
                uri: "https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media",
                mimeType: "video/mp4"
              }
            }
          ]
        }
      }
    });
    expect(result.status).toBe("completed");
    expect(result.videoUrl).toContain("files/abc");
  });

  it("returns polling while operation is in progress", () => {
    const result = normalizeOperation("op1", "veo-3.1-generate-preview", { done: false });
    expect(result.status).toBe("polling");
  });
});
