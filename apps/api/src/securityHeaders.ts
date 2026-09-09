import type { FastifyInstance } from "fastify";

export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("X-DNS-Prefetch-Control", "off");
    return payload;
  });
}

export function corsOrigins(): string[] | boolean {
  const configured = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (configured?.length) return configured;
  if (process.env.NODE_ENV === "production") {
    const appUrl = process.env.APP_URL?.trim();
    return appUrl ? [appUrl] : ["https://prompt2spot.com"];
  }
  return true;
}
