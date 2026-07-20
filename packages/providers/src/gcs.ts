import { Storage, type StorageOptions } from "@google-cloud/storage";
import type { GcsClient } from "@studio/shared";

let cached: Storage | null = null;

function client(): Storage {
  if (cached) return cached;
  const opts: StorageOptions = {};
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    opts.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  } else {
    const inline = process.env.GCS_CREDENTIALS_JSON?.trim();
    if (inline) {
      try {
        opts.credentials = JSON.parse(inline);
      } catch (error) {
        throw new Error(`GCS_CREDENTIALS_JSON is not valid JSON: ${(error as Error).message}`);
      }
    }
  }
  cached = new Storage(opts);
  return cached;
}

export function bucketName(): string {
  const name = process.env.GCS_BUCKET;
  if (!name) throw new Error("GCS_BUCKET is not set");
  return name;
}

/** Extract object path from a storage.googleapis.com URL (signed or public). */
export function gcsPathFromStorageUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "storage.googleapis.com") return null;
    const parts = parsed.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) return null;
    const bucket = parts[0];
    if (bucket !== bucketName()) return null;
    return parts.slice(1).join("/");
  } catch {
    return null;
  }
}

export function gcsClient(): GcsClient {
  return {
    bucket(): string {
      return bucketName();
    },
    async upload(input) {
      const file = client().bucket(bucketName()).file(input.gcsPath);
      const body = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : Buffer.from(input.body);
      await file.save(body, { contentType: input.mimeType, resumable: false });
      return { gcsPath: input.gcsPath, sizeBytes: body.byteLength };
    },
    async download(gcsPath) {
      const file = client().bucket(bucketName()).file(gcsPath);
      const [body] = await file.download();
      const [meta] = await file.getMetadata().catch(() => [{ contentType: undefined }]);
      return {
        body: Buffer.from(body),
        mimeType: meta.contentType ?? "application/octet-stream"
      };
    },
    async signedUrl(gcsPath, ttlSeconds) {
      const ttl = ttlSeconds ?? Number(process.env.GCS_SIGNED_URL_TTL_SECONDS ?? 3600);
      const [url] = await client().bucket(bucketName()).file(gcsPath).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + ttl * 1000
      });
      return url;
    }
  };
}
