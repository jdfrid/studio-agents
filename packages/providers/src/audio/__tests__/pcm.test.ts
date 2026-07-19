import { describe, expect, it } from "vitest";
import { isRawPcmMimeType, normalizeAudioForPlayback, pcmToWav } from "../pcm.js";

describe("pcm audio helpers", () => {
  it("detects Gemini LPCM mime types", () => {
    expect(isRawPcmMimeType("audio/L16;codec=pcm;rate=24000")).toBe(true);
    expect(isRawPcmMimeType("audio/mpeg")).toBe(false);
  });

  it("wraps raw PCM in a playable WAV container", () => {
    const pcm = Buffer.from([0, 0, 1, 0, 2, 0]);
    const wav = pcmToWav(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 });
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.length).toBe(44 + pcm.length);
  });

  it("normalizes LPCM to audio/wav", () => {
    const pcm = Buffer.alloc(4);
    const out = normalizeAudioForPlayback(pcm, "audio/L16;codec=pcm;rate=24000");
    expect(out.mimeType).toBe("audio/wav");
    expect(out.extension).toBe("wav");
    expect(out.body.subarray(0, 4).toString()).toBe("RIFF");
  });
});
