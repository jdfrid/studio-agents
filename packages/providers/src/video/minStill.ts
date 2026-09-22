import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderError } from "@studio/shared";

export const FAL_MIN_STILL_PX = 300;

export type ImageBytes = { body: Buffer; mimeType: string };

export function probeImageDimensions(body: Buffer): { width: number; height: number } | null {
  if (body.length < 24) return null;
  if (body[0] === 0xff && body[1] === 0xd8) return jpegSize(body);
  if (body[0] === 0x89 && body.toString("ascii", 1, 4) === "PNG") {
    return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
  }
  if (body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") {
    return webpSize(body);
  }
  return null;
}

function jpegSize(body: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < body.length) {
    if (body[offset] !== 0xff) return null;
    const marker = body[offset + 1]!;
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = body.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > body.length) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: body.readUInt16BE(offset + 5), width: body.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(body: Buffer): { width: number; height: number } | null {
  const chunk = body.toString("ascii", 12, 16);
  if (chunk === "VP8X" && body.length >= 30) {
    const width = 1 + (body[24]! | (body[25]! << 8) | (body[26]! << 16));
    const height = 1 + (body[27]! | (body[28]! << 8) | (body[29]! << 16));
    return { width, height };
  }
  if (chunk === "VP8 " && body.length >= 30 && body[23] === 0x9d && body[24] === 0x01 && body[25] === 0x2a) {
    return { width: body.readUInt16LE(26) & 0x3fff, height: body.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && body.length >= 25 && body[20] === 0x2f) {
    const bits = body[21]! | (body[22]! << 8) | (body[23]! << 16) | (body[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function resolveFfmpegBinary(explicit?: string): string | null {
  const candidates = [
    explicit?.trim(),
    process.env.FFMPEG_PATH?.trim(),
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg"
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "ffmpeg";
}

function needsUpscale(size: { width: number; height: number } | null, minSize: number): boolean {
  if (!size) return true;
  return size.width < minSize || size.height < minSize;
}

export async function ensureMinImageForFal(
  image: ImageBytes | null | undefined,
  options?: { minSize?: number; ffmpegPath?: string }
): Promise<ImageBytes | null> {
  if (!image?.body?.length) return image ?? null;
  const minSize = options?.minSize ?? FAL_MIN_STILL_PX;
  const size = probeImageDimensions(image.body);
  if (!needsUpscale(size, minSize)) return image;

  const ffmpeg = resolveFfmpegBinary(options?.ffmpegPath);
  if (!ffmpeg) {
    throw new ProviderError(
      size
        ? `Reference image is ${size.width}×${size.height}px; video generation needs at least ${minSize}×${minSize}.`
        : `Reference image could not be read; video generation needs at least ${minSize}×${minSize}.`,
      { provider: "fal", metadata: { kind: "image_too_small", size, minSize } }
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), "fal-still-"));
  const input = path.join(dir, "in.bin");
  const output = path.join(dir, "out.jpg");
  try {
    await writeFile(input, image.body);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      input,
      "-vf",
      `scale='max(${minSize},iw)':'max(${minSize},ih)':force_original_aspect_ratio=increase:force_divisible_by=2`,
      "-q:v",
      "2",
      output
    ]);
    const body = await readFile(output);
    if (!body.length) {
      throw new ProviderError("Failed to upscale reference image for video generation", {
        provider: "fal",
        metadata: { kind: "image_too_small", size, minSize }
      });
    }
    return { body, mimeType: "image/jpeg" };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderError(
      size
        ? `Reference image is ${size.width}×${size.height}px (minimum ${minSize}×${minSize}) and could not be enlarged: ${message}`
        : `Reference image is too small or unreadable for video generation: ${message}`,
      { provider: "fal", metadata: { kind: "image_too_small", size, minSize, raw: message } }
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg ${signal ?? code}: ${stderr.replace(/\s+/g, " ").trim().slice(0, 400)}`));
    });
  });
}
