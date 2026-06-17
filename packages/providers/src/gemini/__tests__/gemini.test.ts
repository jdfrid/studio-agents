import { describe, expect, it } from "vitest";
import { checkGeminiCapabilities, geminiGenerateVeoVideo } from "../index.js";
import type { ProviderCredentialView } from "@studio/shared";

const mockProvider: ProviderCredentialView = {
  id: "p1",
  type: "GEMINI",
  provider: "gemini",
  priority: 1,
  secret: "test-key",
  config: {
    mock: true,
    skipCapabilityProbe: true,
    capabilities: { music: true },
    models: {
      text: "gemini-test-text",
      tts: "gemini-test-tts",
      image: "gemini-test-image",
      music: "lyria-test",
      video: "veo-test"
    }
  }
};

describe("Gemini provider helpers", () => {
  it("reports configured capabilities without network probing", () => {
    const caps = checkGeminiCapabilities(mockProvider);
    expect(caps.apiKeyConfigured).toBe(true);
    expect(caps.video.available).toBe(true);
    expect(caps.music.available).toBe(true);
    expect(caps.video.model).toBe("veo-test");
  });

  it("returns a deterministic mock Veo operation", async () => {
    const result = await geminiGenerateVeoVideo(mockProvider, {
      sceneId: "scene-1",
      prompt: "cinematic watch close-up",
      aspectRatio: "9:16",
      durationBucket: "4"
    });
    expect(result.status).toBe("completed");
    expect(result.operationName).toContain("scene-1");
    expect(result.videoBytes?.toString()).toContain("mock video");
  });
});
