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

  it("parses video.name file reference instead of uri", () => {
    const result = normalizeOperation("op1", "veo-3.1-fast-generate-preview", {
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [{ video: { name: "files/abc123", mimeType: "video/mp4" } }]
        }
      }
    });
    expect(result.status).toBe("completed");
    expect(result.videoFileName).toBe("files/abc123");
  });

  it("marks RAI-filtered operations as failed", () => {
    const result = normalizeOperation("op1", "veo-3.1-fast-generate-preview", {
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [],
          raiMediaFilteredReasons: ["Violence filter triggered"]
        }
      }
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Violence");
  });

  it("marks completed-without-payload operations for downstream handling", () => {
    const result = normalizeOperation("op1", "veo-3.1-fast-generate-preview", {
      done: true,
      response: { generateVideoResponse: { generatedSamples: [] } }
    });
    expect(result.status).toBe("completed");
    expect(result.error).toContain("No video payload");
  });
});
