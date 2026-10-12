import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { gcsPathFromStorageUrl } from "@studio/providers";

const PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "content-disposition",
  "last-modified",
  "etag"
];

/**
 * Same-origin relay for GCS signed URLs. Some networks (e.g. content filters such as
 * NetFree) block or stall storage.googleapis.com media, so the browser fetches through
 * reelmino.com instead. Authorization is unchanged: only a still-valid signed URL for our
 * own bucket is relayed, exactly what the browser could already fetch directly.
 */
export function registerMediaProxy(app: FastifyInstance) {
  app.get("/media", async (request, reply) => {
    const { u } = z.object({ u: z.string().url().max(4000) }).parse(request.query);
    const target = new URL(u);
    if (
      target.protocol !== "https:" ||
      !gcsPathFromStorageUrl(u) ||
      !target.searchParams.has("X-Goog-Signature")
    ) {
      reply.code(400);
      return { error: "invalid_media_url" };
    }
    const range = request.headers.range;
    const controller = new AbortController();
    request.raw.on("close", () => controller.abort());
    const upstream = await fetch(target, {
      headers: range ? { Range: range } : {},
      signal: controller.signal
    }).catch(() => null);
    if (!upstream) {
      reply.code(502);
      return { error: "media_unavailable" };
    }
    reply.code(upstream.status);
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) reply.header(name, value);
    }
    reply.header("cache-control", "private, max-age=600");
    if (!upstream.body) return reply.send();
    return reply.send(Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream));
  });
}
