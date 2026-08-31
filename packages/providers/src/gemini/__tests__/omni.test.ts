import { describe, expect, it } from "vitest";
import { ProviderError } from "@studio/shared";
import {
  buildOmniRequest,
  geminiGenerateOmniVideo,
  isOmniFallbackError,
  normalizeOmniInteraction
} from "../omni.js";

describe("Gemini Omni Interactions adapter", () => {
  it("builds the documented image-to-video REST payload", () => {
    const body = buildOmniRequest(
      {
        sceneId: "scene-1",
        prompt: "A smooth product orbit",
        aspectRatio: "9:16",
        durationBucket: "6",
        referenceImage: { body: Buffer.from("image"), mimeType: "image/png" }
      },
      "gemini-omni-1.1-flash-preview"
    );
    expect(body.model).toBe("gemini-omni-1.1-flash-preview");
    expect(body.input).toEqual([
      {
        type: "image",
        data: Buffer.from("image").toString("base64"),
        mime_type: "image/png"
      },
      { type: "text", text: "A smooth product orbit" }
    ]);
    expect(body).toMatchObject({
      response_format: { type: "video", aspect_ratio: "9:16" },
      generation_config: { video_config: { task: "image_to_video" } }
    });
  });

  it("extracts inline video from the REST steps array", () => {
    const result = normalizeOmniInteraction(
      {
        id: "v1_interaction",
        status: "completed",
        model: "gemini-omni-1.1-flash-preview",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "video",
                mime_type: "video/mp4",
                data: Buffer.from("video").toString("base64")
              }
            ]
          }
        ]
      },
      "gemini-omni-1.1-flash-preview"
    );
    expect(result.status).toBe("completed");
    expect(result.operationName).toBe("v1_interaction");
    expect(result.videoBytes?.toString()).toBe("video");
  });

  it("falls back only for unavailable or unsupported model errors", () => {
    expect(
      isOmniFallbackError(
        new ProviderError("model unavailable", {
          provider: "gemini",
          metadata: { status: 503 }
        })
      )
    ).toBe(true);
    expect(
      isOmniFallbackError(
        new ProviderError("permission denied", {
          provider: "gemini",
          metadata: { status: 403 }
        })
      )
    ).toBe(false);
  });

  it("records the actual Omni model used", async () => {
    const models: string[] = [];
    const result = await geminiGenerateOmniVideo(
      {
        id: "gemini",
        type: "GEMINI",
        provider: "gemini",
        priority: 1,
        secret: "test",
        config: {
          mock: true,
          models: { video: "gemini-omni-1.1-flash-preview" }
        }
      },
      {
        sceneId: "scene-usage",
        prompt: "A cinematic product shot",
        aspectRatio: "9:16",
        durationBucket: "6",
        durationSeconds: 6
      },
      {
        onUsage: (event) => {
          models.push(event.model ?? "");
        }
      }
    );
    expect(result.model).toBe("gemini-omni-1.1-flash-preview");
    expect(models).toEqual(["gemini-omni-1.1-flash-preview"]);
  });
});
