import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { registerRoutes } from "./routes.js";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

await app.register(cors, { origin: true });
await app.register(sensible);

await registerRoutes(app);

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
