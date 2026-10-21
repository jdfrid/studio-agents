import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { hashPassword, nid, secretsKey, sessionSecret } from "./crypto.js";
import { ensureFirstOperator, openDb, operatorCount } from "./db.js";
import { defaultPaths } from "./paths.js";
import { registerRoutes, sendMedia, type AppCtx } from "./routes.js";
import { startScheduler } from "./scheduler.js";

function loadEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export type BuildOptions = {
  dataDir?: string;
  webPublic?: string;
  promoKit?: string;
  publicDir?: string;
  listen?: boolean;
};

export async function buildApp(options: BuildOptions = {}) {
  const defaults = defaultPaths();
  loadEnv(path.join(defaults.appRoot, ".env"));
  const dataDir = options.dataDir ?? defaults.dataDir;
  const webPublic = options.webPublic ?? (process.env.GROWTH_WEB_PUBLIC?.trim() || defaults.webPublic);
  const promoKit = options.promoKit ?? defaults.promoKit;
  const publicDir = options.publicDir ?? path.join(defaults.appRoot, "public");
  const port = Number(process.env.GROWTH_PORT || 4180);
  const publicBase = (process.env.GROWTH_PUBLIC_BASE || `http://127.0.0.1:${port}`).replace(/\/$/, "");
  const origin = (process.env.GROWTH_SITE_ORIGIN || "https://reelmino.com").replace(/\/$/, "");
  const key = secretsKey(dataDir);
  const db = openDb(path.join(dataDir, "growth.sqlite"));
  const bootstrapPassword = process.env.GROWTH_OPERATOR_PASSWORD?.trim() ?? "";
  if (bootstrapPassword && operatorCount(db) === 0) {
    ensureFirstOperator(db, process.env.GROWTH_OPERATOR_NAME?.trim() || "מפעיל", hashPassword(bootstrapPassword), nid());
  }
  const ctx: AppCtx = {
    db,
    key,
    secret: sessionSecret(dataDir),
    mediaDir: path.join(dataDir, "media"),
    publicBase,
    webPublic,
    sitemapBase: path.join(defaults.webPublic, "sitemap.xml"),
    origin,
    repoPromo: promoKit
  };
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: ctx.secret });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });
  app.get("/", async (_request, reply) => {
    reply.type("text/html").send(readFileSync(path.join(publicDir, "index.html")));
  });
  app.get("/app.js", async (_request, reply) => {
    reply.type("application/javascript").send(readFileSync(path.join(publicDir, "app.js")));
  });
  app.get("/media/:filename", async (request, reply) =>
    sendMedia(reply, ctx.mediaDir, (request.params as { filename: string }).filename, request.headers.range)
  );
  registerRoutes(app, ctx);
  app.setErrorHandler((error, _request, reply) => {
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    reply.code(status).send({ error: error.message });
  });
  const stopScheduler = options.listen === false || process.env.GROWTH_DISABLE_SCHEDULER === "1" ? () => undefined : startScheduler(ctx);
  return {
    app,
    db,
    ctx,
    async close() {
      stopScheduler();
      await app.close();
      db.close();
    }
  };
}

const invoked = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (invoked.endsWith("/server.ts") || invoked.endsWith("/server.js")) {
  const port = Number(process.env.GROWTH_PORT || 4180);
  const host = process.env.GROWTH_HOST || "127.0.0.1";
  const started = await buildApp({ listen: true });
  await started.app.listen({ port, host });
  console.log(`Reelmino growth console at ${started.ctx.publicBase}`);
}
