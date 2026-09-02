import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ConnectTelegramRequestSchema,
  CreateContentPackageRequestSchema,
  PatchDestinationRequestSchema,
  PreviewPackageRequestSchema,
  ResolveTelegramChatRequestSchema,
  SocialNetworkSchema,
  UpsertDistributeRuleRequestSchema
} from "@studio/shared";
import {
  cancelPublishJob,
  completeSocialOAuth,
  confirmPublishJob,
  connectTelegramBot,
  createDistributionPackage,
  disconnectConnection,
  getDistributeRule,
  getPackage,
  listConnections,
  listDestinations,
  listDistributionNetworks,
  listPackages,
  listPublishJobs,
  oauthReturnUrl,
  patchDestination,
  previewPackageForUser,
  resolveTelegramDestination,
  retryPublishJob,
  startSocialOAuth,
  syncDestinationsForUser,
  upsertDistributeRule,
  verifyOAuthState
} from "@studio/orchestrator";
import { requireAuth } from "@studio/auth";

function errorStatus(message: string): number {
  if (/not_found|artifact_not_found|destination_not_found|connection_not_found|chat_not_found|user_not_found/i.test(message)) {
    return 404;
  }
  if (/unauthorized|oauth_state|oauth_network/i.test(message)) return 401;
  if (/not_configured|oauth_not_supported/i.test(message)) return 501;
  return 400;
}

export async function registerDistributionRoutes(app: FastifyInstance) {
  app.get("/distribution/oauth/:network/callback", async (request, reply) => {
    const { network } = z.object({ network: SocialNetworkSchema }).parse(request.params);
    const query = z
      .object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional()
      })
      .parse(request.query);
    if (query.error || !query.code || !query.state) {
      return reply.redirect(
        oauthReturnUrl({
          connected: network,
          error: query.error_description || query.error || "missing_code"
        })
      );
    }
    try {
      verifyOAuthState(query.state);
      await completeSocialOAuth(network, query.code, query.state);
      return reply.redirect(oauthReturnUrl({ connected: network }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "oauth_failed";
      return reply.redirect(oauthReturnUrl({ connected: network, error: message.slice(0, 180) }));
    }
  });

  await app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth());

    scoped.get("/distribution/networks", async () => listDistributionNetworks());

    scoped.get("/distribution/connections", async (request) => listConnections(request.user!.sub));

    scoped.post("/distribution/connections/:network/start", async (request, reply) => {
      const { network } = z.object({ network: SocialNetworkSchema }).parse(request.params);
      try {
        return await startSocialOAuth(request.user!.sub, network);
      } catch (error) {
        const message = error instanceof Error ? error.message : "start_failed";
        reply.code(errorStatus(message));
        return { error: message };
      }
    });

    scoped.post("/distribution/connections/telegram", async (request, reply) => {
      const body = ConnectTelegramRequestSchema.parse(request.body);
      try {
        const connection = await connectTelegramBot(request.user!.sub, body.botToken);
        reply.code(201);
        return connection;
      } catch (error) {
        const message = error instanceof Error ? error.message : "connect_failed";
        reply.code(errorStatus(message));
        return { error: message };
      }
    });

    scoped.delete("/distribution/connections/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const ok = await disconnectConnection(request.user!.sub, id);
      if (!ok) {
        reply.code(404);
        return { error: "not_found" };
      }
      return { ok: true };
    });

    scoped.post("/distribution/connections/:id/sync", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      try {
        return await syncDestinationsForUser(request.user!.sub, id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "sync_failed";
        reply.code(errorStatus(message));
        return { error: message };
      }
    });

    scoped.post("/distribution/connections/:id/telegram/chats", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = ResolveTelegramChatRequestSchema.parse(request.body);
      try {
        const destination = await resolveTelegramDestination(request.user!.sub, id, body.chatId);
        reply.code(201);
        return destination;
      } catch (error) {
        const message = error instanceof Error ? error.message : "resolve_failed";
        reply.code(errorStatus(message));
        return { error: message };
      }
    });

    scoped.get("/distribution/destinations", async (request) => listDestinations(request.user!.sub));

    scoped.patch("/distribution/destinations/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = PatchDestinationRequestSchema.parse(request.body);
      const row = await patchDestination(request.user!.sub, id, body);
      if (!row) {
        reply.code(404);
        return { error: "not_found" };
      }
      return row;
    });

    scoped.post("/distribution/packages/preview", async (request, reply) => {
      const body = PreviewPackageRequestSchema.parse(request.body);
      try {
        return await previewPackageForUser(request.user!.sub, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : "preview_failed";
        reply.code(errorStatus(message));
        return { error: message };
      }
    });

    scoped.post("/distribution/packages", async (request, reply) => {
      const body = CreateContentPackageRequestSchema.parse(request.body);
      try {
        const created = await createDistributionPackage(request.user!.sub, body);
        reply.code(201);
        return created;
      } catch (error) {
        const message = error instanceof Error ? error.message : "create_failed";
        reply.code(errorStatus(message));
        return { error: message };
      }
    });

    scoped.get("/distribution/packages", async (request) => listPackages(request.user!.sub));

    scoped.get("/distribution/packages/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const row = await getPackage(request.user!.sub, id);
      if (!row) {
        reply.code(404);
        return { error: "not_found" };
      }
      return row;
    });

    scoped.get("/distribution/jobs", async (request) => listPublishJobs(request.user!.sub));

    scoped.post("/distribution/jobs/:id/confirm", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const row = await confirmPublishJob(request.user!.sub, id);
      if (!row) {
        reply.code(404);
        return { error: "not_found" };
      }
      return row;
    });

    scoped.post("/distribution/jobs/:id/retry", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const row = await retryPublishJob(request.user!.sub, id);
      if (!row) {
        reply.code(404);
        return { error: "not_found" };
      }
      return row;
    });

    scoped.post("/distribution/jobs/:id/cancel", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const row = await cancelPublishJob(request.user!.sub, id);
      if (!row) {
        reply.code(404);
        return { error: "not_found" };
      }
      return row;
    });

    scoped.get("/distribution/rules", async (request) => getDistributeRule(request.user!.sub));

    scoped.put("/distribution/rules", async (request) => {
      const body = UpsertDistributeRuleRequestSchema.parse(request.body);
      return upsertDistributeRule(request.user!.sub, body);
    });
  });
}
