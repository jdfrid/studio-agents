import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ensureMinImageForFal, probeImageDimensions } from "../minStill.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const JPEG_SOF_10X20 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x0a, 0x00, 0x14, 0x01]),
  Buffer.alloc(16)
]);

describe("probeImageDimensions", () => {
  it("reads a 1×1 PNG", () => {
    expect(probeImageDimensions(PNG_1X1)).toEqual({ width: 1, height: 1 });
  });

  it("reads JPEG SOF dimensions", () => {
    expect(probeImageDimensions(JPEG_SOF_10X20)).toEqual({ width: 20, height: 10 });
  });

  it("returns null for garbage", () => {
    expect(probeImageDimensions(Buffer.from("not-an-image"))).toBeNull();
  });
});

describe("ensureMinImageForFal", () => {
  const ffmpeg = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((bin) => existsSync(bin));

  it.skipIf(!ffmpeg)("upscales a 1×1 PNG to at least 300×300", async () => {
    const out = await ensureMinImageForFal(
      { body: PNG_1X1, mimeType: "image/png" },
      { ffmpegPath: ffmpeg }
    );
    expect(out?.mimeType).toBe("image/jpeg");
    const size = probeImageDimensions(out!.body);
    expect(size).toBeTruthy();
    expect(size!.width).toBeGreaterThanOrEqual(300);
    expect(size!.height).toBeGreaterThanOrEqual(300);
  });
});
