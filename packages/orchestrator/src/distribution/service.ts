import { prisma, Prisma } from "@studio/infra-prisma";
import {
  DestinationConfigSchema,
  type CreateContentPackageRequest,
  type IngestMedia,
  type PackageMediaItem,
  type PatchDestinationRequest,
  type PreviewPackageRequest,
  type SocialNetwork,
  type TransformPreview,
  type UpsertDistributeRuleRequest
} from "@studio/shared";
import {
  decryptTokens,
  encryptTokens,
  getNetworkAdapter,
  gcsClient,
  httpBytes,
  listNetworkPublicViews,
  randomPkce,
  type SocialTokens
} from "@studio/providers";
import { enqueuePublishJob } from "./queue.js";
import { oauthCallbackUrl, signOAuthState } from "./oauth.js";
import {
  fromPrismaNetwork,
  toPrismaAuthKind,
  toPrismaDestinationKind,
  toPrismaDestinationStatus,
  toPrismaJobStatus,
  toPrismaNetwork,
  toPrismaPackageSource,
  toPrismaPublishMode
} from "./map.js";
import { connectionView, destinationView, jobView, packageView, parseCopy, parseDestConfig, parseMedia } from "./views.js";

async function tenantIdForUser(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  if (!user) throw new Error("user_not_found");
  return user.tenantId;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "media.bin";
}

function kindFromMime(mime: string): PackageMediaItem["kind"] {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "image";
}

async function resolveIngestMedia(
  tenantId: string,
  userId: string,
  packageId: string,
  item: IngestMedia,
  index: number
): Promise<PackageMediaItem> {
  const storage = gcsClient();
  if ("artifactId" in item) {
    const artifact = await prisma.artifact.findUnique({
      where: { id: item.artifactId },
      include: { run: { select: { tenantId: true, userId: true } } }
    });
    if (!artifact || artifact.run.tenantId !== tenantId) throw new Error("artifact_not_found");
    if (artifact.run.userId && artifact.run.userId !== userId) throw new Error("artifact_not_found");
    return {
      kind: kindFromMime(artifact.mimeType),
      gcsPath: artifact.gcsPath,
      mimeType: artifact.mimeType,
      filename: artifact.gcsPath.split("/").pop(),
      sizeBytes: artifact.sizeBytes,
      ...(typeof artifact.metadata === "object" && artifact.metadata
        ? (artifact.metadata as { width?: number; height?: number; durationMs?: number })
        : {})
    };
  }
  if ("gcsPath" in item) {
    return {
      kind: item.kind,
      gcsPath: item.gcsPath,
      mimeType: item.mimeType,
      filename: item.filename,
      width: item.width,
      height: item.height,
      durationMs: item.durationMs,
      sizeBytes: item.sizeBytes
    };
  }
  if ("url" in item) {
    const downloaded = await httpBytes(item.url, { timeoutMs: 180_000 });
    const filename = sanitizeFilename(item.filename || item.url.split("/").pop() || `media-${index}`);
    const gcsPath = `distribution/${tenantId}/${packageId}/${Date.now()}-${filename}`;
    const { sizeBytes } = await storage.upload({ gcsPath, body: downloaded.body, mimeType: downloaded.mimeType });
    return {
      kind: item.kind ?? kindFromMime(downloaded.mimeType),
      gcsPath,
      mimeType: downloaded.mimeType,
      filename,
      sizeBytes
    };
  }
  const body = Buffer.from(item.base64, "base64");
  const filename = sanitizeFilename(item.filename);
  const gcsPath = `distribution/${tenantId}/${packageId}/${Date.now()}-${filename}`;
  const { sizeBytes } = await storage.upload({ gcsPath, body, mimeType: item.mimeType });
  return {
    kind: item.kind ?? kindFromMime(item.mimeType),
    gcsPath,
    mimeType: item.mimeType,
    filename,
    sizeBytes
  };
}

async function upsertConnection(input: {
  tenantId: string;
  userId: string;
  network: SocialNetwork;
  tokens: SocialTokens;
  identity: {
    externalUserId: string;
    displayName: string;
    handle?: string;
    avatarUrl?: string;
    scopes?: string[];
  };
}) {
  const adapter = getNetworkAdapter(input.network);
  return prisma.socialConnection.upsert({
    where: {
      tenantId_network_externalUserId: {
        tenantId: input.tenantId,
        network: toPrismaNetwork(input.network),
        externalUserId: input.identity.externalUserId
      }
    },
    create: {
      tenantId: input.tenantId,
      network: toPrismaNetwork(input.network),
      authKind: toPrismaAuthKind(adapter.authKind),
      encryptedTokens: encryptTokens(input.tokens),
      externalUserId: input.identity.externalUserId,
      displayName: input.identity.displayName,
      handle: input.identity.handle,
      avatarUrl: input.identity.avatarUrl,
      scopes: input.identity.scopes ?? [],
      status: "active",
      connectedByUserId: input.userId
    },
    update: {
      encryptedTokens: encryptTokens(input.tokens),
      displayName: input.identity.displayName,
      handle: input.identity.handle,
      avatarUrl: input.identity.avatarUrl,
      scopes: input.identity.scopes ?? [],
      status: "active",
      connectedByUserId: input.userId
    }
  });
}

export async function listDistributionNetworks() {
  return listNetworkPublicViews();
}

export async function startSocialOAuth(userId: string, network: SocialNetwork) {
  const adapter = getNetworkAdapter(network);
  if (!adapter.startOAuth) throw new Error("oauth_not_supported");
  const tenantId = await tenantIdForUser(userId);
  const pkce = adapter.pkce ? randomPkce() : undefined;
  const state = signOAuthState({
    tenantId,
    userId,
    network,
    codeVerifier: pkce?.verifier
  });
  const started = await adapter.startOAuth({
    redirectUri: oauthCallbackUrl(network),
    state,
    codeChallenge: pkce?.challenge
  });
  return { authorizeUrl: started.authorizeUrl };
}

export async function completeSocialOAuth(network: SocialNetwork, code: string, stateToken: string) {
  const state = (await import("./oauth.js")).verifyOAuthState(stateToken);
  if (state.network !== network) throw new Error("oauth_network_mismatch");
  const adapter = getNetworkAdapter(network);
  if (!adapter.exchangeOAuth) throw new Error("oauth_not_supported");
  const exchanged = await adapter.exchangeOAuth({
    code,
    redirectUri: oauthCallbackUrl(network),
    codeVerifier: state.codeVerifier
  });
  const connection = await upsertConnection({
    tenantId: state.tenantId,
    userId: state.userId,
    network,
    tokens: exchanged.tokens,
    identity: exchanged.identity
  });
  await syncConnectionDestinations(state.tenantId, connection.id);
  return connectionView(connection);
}

export async function connectTelegramBot(userId: string, botToken: string) {
  const tenantId = await tenantIdForUser(userId);
  const adapter = getNetworkAdapter("telegram");
  const tokens: SocialTokens = { accessToken: botToken, botToken };
  const identity = await adapter.identify!(tokens);
  const connection = await upsertConnection({ tenantId, userId, network: "telegram", tokens, identity });
  await syncConnectionDestinations(tenantId, connection.id);
  return connectionView(connection);
}

export async function listConnections(userId: string) {
  const tenantId = await tenantIdForUser(userId);
  const rows = await prisma.socialConnection.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" }
  });
  return rows.map(connectionView);
}

export async function disconnectConnection(userId: string, connectionId: string) {
  const tenantId = await tenantIdForUser(userId);
  const row = await prisma.socialConnection.findFirst({ where: { id: connectionId, tenantId } });
  if (!row) return false;
  await prisma.socialConnection.delete({ where: { id: connectionId } });
  return true;
}

export async function syncConnectionDestinations(tenantId: string, connectionId: string) {
  const connection = await prisma.socialConnection.findFirst({ where: { id: connectionId, tenantId } });
  if (!connection?.encryptedTokens) throw new Error("connection_not_found");
  const adapter = getNetworkAdapter(fromPrismaNetwork(connection.network));
  const tokens = decryptTokens(connection.encryptedTokens);
  const drafts = await adapter.listDestinations(tokens);
  const now = new Date();
  const pageTokens = { ...(tokens.pageTokens ?? {}) };
  for (const draft of drafts) {
    if (draft.config?.pageAccessToken) pageTokens[draft.externalId] = draft.config.pageAccessToken;
    const config = { ...(draft.config ?? {}) };
    delete config.pageAccessToken;
    await prisma.socialDestination.upsert({
      where: {
        connectionId_kind_externalId: {
          connectionId,
          kind: toPrismaDestinationKind(draft.kind),
          externalId: draft.externalId
        }
      },
      create: {
        tenantId,
        connectionId,
        kind: toPrismaDestinationKind(draft.kind),
        externalId: draft.externalId,
        name: draft.name,
        handle: draft.handle,
        url: draft.url,
        capabilities: (draft.capabilities ?? {}) as Prisma.InputJsonValue,
        config: { ...config, ...(draft.config?.pageAccessToken ? { pageAccessToken: draft.config.pageAccessToken } : {}) } as Prisma.InputJsonValue,
        lastSyncedAt: now,
        status: "active"
      },
      update: {
        name: draft.name,
        handle: draft.handle,
        url: draft.url,
        capabilities: (draft.capabilities ?? {}) as Prisma.InputJsonValue,
        lastSyncedAt: now,
        status: "active",
        ...(draft.config?.pageAccessToken
          ? { config: { ...parseDestConfig(undefined), ...config, pageAccessToken: draft.config.pageAccessToken } as Prisma.InputJsonValue }
          : {})
      }
    });
  }
  if (Object.keys(pageTokens).length) {
    await prisma.socialConnection.update({
      where: { id: connectionId },
      data: { encryptedTokens: encryptTokens({ ...tokens, pageTokens }), lastSyncedAt: now }
    });
  } else {
    await prisma.socialConnection.update({ where: { id: connectionId }, data: { lastSyncedAt: now } });
  }
  const rows = await prisma.socialDestination.findMany({
    where: { connectionId },
    include: { connection: true },
    orderBy: { name: "asc" }
  });
  return rows.map(destinationView);
}

export async function syncDestinationsForUser(userId: string, connectionId: string) {
  const tenantId = await tenantIdForUser(userId);
  return syncConnectionDestinations(tenantId, connectionId);
}

export async function resolveTelegramDestination(userId: string, connectionId: string, chatId: string) {
  const tenantId = await tenantIdForUser(userId);
  const connection = await prisma.socialConnection.findFirst({ where: { id: connectionId, tenantId, network: "TELEGRAM" } });
  if (!connection?.encryptedTokens) throw new Error("connection_not_found");
  const adapter = getNetworkAdapter("telegram");
  if (!adapter.resolveDestination) throw new Error("resolve_not_supported");
  const draft = await adapter.resolveDestination(decryptTokens(connection.encryptedTokens), chatId);
  if (!draft) throw new Error("chat_not_found");
  const row = await prisma.socialDestination.upsert({
    where: {
      connectionId_kind_externalId: {
        connectionId,
        kind: toPrismaDestinationKind(draft.kind),
        externalId: draft.externalId
      }
    },
    create: {
      tenantId,
      connectionId,
      kind: toPrismaDestinationKind(draft.kind),
      externalId: draft.externalId,
      name: draft.name,
      handle: draft.handle,
      url: draft.url,
      lastSyncedAt: new Date(),
      status: "active"
    },
    update: {
      name: draft.name,
      handle: draft.handle,
      url: draft.url,
      lastSyncedAt: new Date(),
      status: "active"
    },
    include: { connection: true }
  });
  return destinationView(row);
}

export async function listDestinations(userId: string) {
  const tenantId = await tenantIdForUser(userId);
  const rows = await prisma.socialDestination.findMany({
    where: { tenantId, status: { not: "archived" } },
    include: { connection: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  });
  return rows.map(destinationView);
}

export async function patchDestination(userId: string, destinationId: string, patch: PatchDestinationRequest) {
  const tenantId = await tenantIdForUser(userId);
  const existing = await prisma.socialDestination.findFirst({ where: { id: destinationId, tenantId }, include: { connection: true } });
  if (!existing) return null;
  const config = { ...parseDestConfig(existing.config), ...(patch.config ?? {}) };
  const parsedConfig = DestinationConfigSchema.parse(config);
  if (patch.isDefault) {
    await prisma.socialDestination.updateMany({
      where: { tenantId, connectionId: existing.connectionId, isDefault: true },
      data: { isDefault: false }
    });
  }
  const row = await prisma.socialDestination.update({
    where: { id: destinationId },
    data: {
      ...(patch.status ? { status: toPrismaDestinationStatus(patch.status) } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      ...(patch.name ? { name: patch.name } : {}),
      config: parsedConfig as Prisma.InputJsonValue
    },
    include: { connection: true }
  });
  return destinationView(row);
}

async function loadDestinationsForTenant(tenantId: string, destinationIds: string[]) {
  const rows = await prisma.socialDestination.findMany({
    where: { tenantId, id: { in: destinationIds } },
    include: { connection: true }
  });
  if (rows.length !== destinationIds.length) throw new Error("destination_not_found");
  return rows;
}

export async function previewPackageForUser(userId: string, body: PreviewPackageRequest) {
  const tenantId = await tenantIdForUser(userId);
  const destinations = await loadDestinationsForTenant(tenantId, body.destinationIds);
  return destinations.map((destination) => {
    const adapter = getNetworkAdapter(fromPrismaNetwork(destination.connection.network));
    const preview = adapter.preview(body.media, body.copy, parseDestConfig(destination.config));
    return { destination: destinationView(destination), preview };
  });
}

async function enqueueIfReady(jobId: string, opts: { delayMs?: number; nativeSchedule?: boolean }) {
  await enqueuePublishJob(jobId, { delayMs: opts.nativeSchedule ? undefined : opts.delayMs });
}

export async function createDistributionPackage(userId: string, request: CreateContentPackageRequest) {
  const tenantId = await tenantIdForUser(userId);
  const destinations = await loadDestinationsForTenant(tenantId, request.destinationIds);
  const created = await prisma.contentPackage.create({
    data: {
      tenantId,
      source: toPrismaPackageSource(request.source),
      runId: request.runId,
      artifactId: request.artifactId,
      mode: toPrismaPublishMode(request.mode),
      scheduleAt: request.scheduleAt ? new Date(request.scheduleAt) : null,
      createdByUserId: userId,
      copy: request.copy as Prisma.InputJsonValue,
      overrides: (request.overrides ?? {}) as Prisma.InputJsonValue
    }
  });

  const media: PackageMediaItem[] = [];
  if (request.artifactId) {
    media.push(await resolveIngestMedia(tenantId, userId, created.id, { artifactId: request.artifactId }, 0));
  }
  for (const [index, item] of request.media.entries()) {
    media.push(await resolveIngestMedia(tenantId, userId, created.id, item, index + 1));
  }
  if (!media.length && request.runId) {
    const artifact = await prisma.artifact.findFirst({
      where: { runId: request.runId, kind: { in: ["series_final_video", "final_video"] }, run: { tenantId } },
      orderBy: { createdAt: "desc" }
    });
    if (artifact) {
      media.push({
        kind: "video",
        gcsPath: artifact.gcsPath,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        filename: "final.mp4"
      });
    }
  }
  if (!media.length && request.source !== "api") {
    /* text-only allowed */
  }
  let coverGcsPath: string | null = null;
  if (request.cover) {
    const cover = await resolveIngestMedia(tenantId, userId, created.id, request.cover, 99);
    coverGcsPath = cover.gcsPath;
  }

  await prisma.contentPackage.update({
    where: { id: created.id },
    data: { media: media as Prisma.InputJsonValue, coverGcsPath }
  });

  const copy = parseCopy(request.copy);
  const jobs = [];
  for (const destination of destinations) {
    const adapter = getNetworkAdapter(fromPrismaNetwork(destination.connection.network));
    const destConfig = {
      ...parseDestConfig(destination.config),
      ...(request.overrides?.[destination.id] ?? {})
    };
    const preview: TransformPreview = adapter.preview(media, copy, destConfig);
    const delayMs =
      request.mode === "schedule" && request.scheduleAt
        ? Math.max(0, new Date(request.scheduleAt).getTime() - Date.now())
        : 0;
    const nativeSchedule = adapter.capabilities.features.scheduleNative && delayMs > 0;
    const needsReview =
      request.mode === "draft" || !preview.accepted || (preview.lossy && !request.confirmLossy);
    const job = await prisma.publishJob.create({
      data: {
        tenantId,
        packageId: created.id,
        destinationId: destination.id,
        status: toPrismaJobStatus(needsReview ? "needs_review" : "queued"),
        nativePayload: preview as unknown as Prisma.InputJsonValue,
        adapterVersion: adapter.adapterVersion,
        scheduledFor: request.scheduleAt ? new Date(request.scheduleAt) : null,
        lastError: preview.accepted ? null : preview.errors.join(", ")
      },
      include: { destination: { include: { connection: true } } }
    });
    if (!needsReview) {
      await enqueueIfReady(job.id, { delayMs, nativeSchedule });
    }
    jobs.push(job);
  }

  const pkg = await prisma.contentPackage.findUniqueOrThrow({
    where: { id: created.id },
    include: { jobs: { include: { destination: { include: { connection: true } } } } }
  });
  return packageView(pkg);
}

export async function listPackages(userId: string) {
  const tenantId = await tenantIdForUser(userId);
  const rows = await prisma.contentPackage.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { jobs: { include: { destination: { include: { connection: true } } } } }
  });
  return rows.map(packageView);
}

export async function getPackage(userId: string, packageId: string) {
  const tenantId = await tenantIdForUser(userId);
  const row = await prisma.contentPackage.findFirst({
    where: { id: packageId, tenantId },
    include: { jobs: { include: { destination: { include: { connection: true } } } } }
  });
  return row ? packageView(row) : null;
}

export async function listPublishJobs(userId: string) {
  const tenantId = await tenantIdForUser(userId);
  const rows = await prisma.publishJob.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { destination: { include: { connection: true } } }
  });
  return rows.map(jobView);
}

export async function confirmPublishJob(userId: string, jobId: string) {
  const tenantId = await tenantIdForUser(userId);
  const job = await prisma.publishJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) return null;
  if (job.status !== "needs_review") return jobView(job);
  await prisma.publishJob.update({ where: { id: jobId }, data: { status: "queued", lastError: null } });
  await enqueuePublishJob(jobId);
  const updated = await prisma.publishJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { destination: { include: { connection: true } } }
  });
  return jobView(updated);
}

export async function retryPublishJob(userId: string, jobId: string) {
  const tenantId = await tenantIdForUser(userId);
  const job = await prisma.publishJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) return null;
  if (job.remotePostId) return jobView(job);
  await prisma.publishJob.update({
    where: { id: jobId },
    data: { status: "queued", lastError: null, errorCode: null }
  });
  await enqueuePublishJob(jobId);
  const updated = await prisma.publishJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { destination: { include: { connection: true } } }
  });
  return jobView(updated);
}

export async function cancelPublishJob(userId: string, jobId: string) {
  const tenantId = await tenantIdForUser(userId);
  const job = await prisma.publishJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) return null;
  if (job.status === "published" || job.status === "uploading") return jobView(job);
  await prisma.publishJob.update({ where: { id: jobId }, data: { status: "cancelled" } });
  const updated = await prisma.publishJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { destination: { include: { connection: true } } }
  });
  return jobView(updated);
}

export async function getDistributeRule(userId: string) {
  const tenantId = await tenantIdForUser(userId);
  const row = await prisma.distributeRule.findUnique({ where: { tenantId } });
  return row
    ? { id: row.id, enabled: row.enabled, destinationIds: row.destinationIds, requireApproval: row.requireApproval }
    : { id: tenantId, enabled: false, destinationIds: [], requireApproval: true };
}

export async function upsertDistributeRule(userId: string, body: UpsertDistributeRuleRequest) {
  const tenantId = await tenantIdForUser(userId);
  if (body.destinationIds.length) {
    await loadDestinationsForTenant(tenantId, body.destinationIds);
  }
  const row = await prisma.distributeRule.upsert({
    where: { tenantId },
    create: {
      tenantId,
      enabled: body.enabled,
      destinationIds: body.destinationIds,
      requireApproval: body.requireApproval
    },
    update: {
      enabled: body.enabled,
      destinationIds: body.destinationIds,
      requireApproval: body.requireApproval
    }
  });
  return { id: row.id, enabled: row.enabled, destinationIds: row.destinationIds, requireApproval: row.requireApproval };
}
