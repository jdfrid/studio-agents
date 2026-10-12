import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMediaProxy } from "./mediaProxy.js";

const signed =
  "https://storage.googleapis.com/studio-test/runs/r1/render/final.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc";

describe("media proxy", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.GCS_BUCKET = "studio-test";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function app() {
    const server = Fastify();
    registerMediaProxy(server);
    await server.ready();
    return server;
  }

  it("relays a signed URL for our bucket with the browser's byte range", async () => {
    const upstream = vi.fn(async (_url: URL, init?: RequestInit) =>
      new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-range": "bytes 0-1/100",
          "accept-ranges": "bytes",
          "x-goog-hash": "secret"
        }
      })
    );
    globalThis.fetch = upstream as unknown as typeof fetch;
    const res = await (await app()).inject({
      method: "GET",
      url: `/media?u=${encodeURIComponent(signed)}`,
      headers: { range: "bytes=0-1" }
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["content-range"]).toBe("bytes 0-1/100");
    expect(res.headers["x-goog-hash"]).toBeUndefined();
    expect(res.rawPayload).toEqual(Buffer.from([1, 2]));
    expect((upstream.mock.calls[0]?.[1]?.headers as Record<string, string>).Range).toBe("bytes=0-1");
  });

  it("refuses other hosts, other buckets and unsigned links", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const server = await app();
    for (const u of [
      "https://evil.example.com/studio-test/x.mp4?X-Goog-Signature=abc",
      "https://storage.googleapis.com/other-bucket/x.mp4?X-Goog-Signature=abc",
      "https://storage.googleapis.com/studio-test/x.mp4"
    ]) {
      const res = await server.inject({ method: "GET", url: `/media?u=${encodeURIComponent(u)}` });
      expect(res.statusCode).toBe(400);
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("passes through an expired signature as an error status", async () => {
    globalThis.fetch = vi.fn(async () => new Response("expired", { status: 400 })) as unknown as typeof fetch;
    const res = await (await app()).inject({ method: "GET", url: `/media?u=${encodeURIComponent(signed)}` });
    expect(res.statusCode).toBe(400);
  });
});
