import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import { refreshPlatformSettingsCache } from "@studio/billing";
import { registerRoutes } from "./routes.js";
import { apiValidationError } from "./validationError.js";

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 32 * 1024 * 1024,
  trustProxy: true
});

app.addHook("preParsing", async (request, _reply, payload) => {
  const url = request.url;
  if (url.startsWith("/billing/webhooks/")) {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    (request as { rawBody?: string }).rawBody = rawBody;
    const { Readable } = await import("node:stream");
    return Readable.from([rawBody]);
  }
  return payload;
});

const corsOrigin = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()) ?? true;
await app.register(cors, { origin: corsOrigin, credentials: true });
await app.register(sensible);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    const response = apiValidationError(error);
    request.log.warn({ validationIssues: response.details.issues }, "request validation failed");
    reply.code(400).send(response);
    return;
  }
  app.log.error(error);
  reply.code(500).send({ error: "internal_error", message: error instanceof Error ? error.message : String(error) });
});

await registerRoutes(app);
await refreshPlatformSettingsCache();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`Studio Agents API listening on ${address}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
