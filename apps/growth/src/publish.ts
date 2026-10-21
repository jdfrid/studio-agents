import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getNetworkAdapter,
  SocialApiError,
  tokenExpired,
  type PublishHandle,
  type PublishMediaFile,
  type SocialTokens
} from "@studio/providers";
import { DestinationConfigSchema, SOCIAL_NETWORKS, type PackageCopyInput, type PackageMediaItem, type SocialNetwork } from "@studio/shared";
import { networkText, type ItemCopy } from "./copy.js";
import { decryptJson, encryptJson, nid } from "./crypto.js";
import {
  getConnection,
  getDestination,
  getJob,
  insertJob,
  queueGroupShares,
  updateConnectionTokens,
  updateJob,
  type Destination,
  type GrowthDb,
  type Item,
  type Job
} from "./db.js";
import { createLinkedInAdapter, linkedinTokenExpired } from "./linkedin.js";
import { applyLink, formatForNetwork, trackedLink } from "./utm.js";

export function isProductNetwork(network: string): network is SocialNetwork {
  return (SOCIAL_NETWORKS as readonly string[]).includes(network);
}

function publisher(network: string) {
  if (network === "linkedin") return createLinkedInAdapter();
  if (!isProductNetwork(network)) throw new Error(`no publisher for ${network}`);
  return getNetworkAdapter(network);
}

function errorCodeOf(error: unknown): string {
  if (error instanceof SocialApiError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/unauthor|expired|401|403/i.test(message)) return "auth_expired";
  return "upload_failed";
}

export function publishCopy(item: Item, network: string, campaign?: string): PackageCopyInput {
  const text = networkText(item.copy, network);
  const link = trackedLink({ network, slug: item.slug, format: formatForNetwork(network), campaign });
  const body = applyLink(text.body || text.title, link);
  return {
    title: text.title || item.title,
    body,
    hashtags: body.includes("#") ? [] : item.copy.hashtags,
    language: item.language
  };
}

function mediaOf(item: Item, mediaDir: string, publicBase: string): PublishMediaFile[] {
  if (!item.mediaPath) return [];
  const filename = item.mediaPath;
  const body = readFileSync(path.join(mediaDir, filename));
  const kind = item.mediaKind === "image" ? "image" : "video";
  const mimeType = item.mediaMime || (kind === "image" ? "image/png" : "video/mp4");
  const itemMedia: PackageMediaItem = {
    kind,
    gcsPath: `local:${filename}`,
    mimeType,
    filename,
    sizeBytes: body.byteLength
  };
  if (item.mediaWidth) itemMedia.width = item.mediaWidth;
  if (item.mediaHeight) itemMedia.height = item.mediaHeight;
  if (item.mediaDurationMs) itemMedia.durationMs = item.mediaDurationMs;
  return [
    {
      item: itemMedia,
      body,
      mimeType,
      filename,
      publicUrl: `${publicBase.replace(/\/$/, "")}/media/${filename}`
    }
  ];
}

async function freshTokens(db: GrowthDb, connectionId: string, key: Buffer, network: string): Promise<SocialTokens> {
  const connection = getConnection(db, connectionId);
  if (!connection || connection.status === "revoked") throw new Error("connection is not active");
  let tokens = decryptJson<SocialTokens>(connection.encryptedTokens, key);
  const adapter = publisher(network);
  const expired = network === "linkedin" ? linkedinTokenExpired(tokens) : tokenExpired(tokens);
  if (expired && adapter.refreshAuth) {
    const refreshed = await adapter.refreshAuth(tokens);
    if (!refreshed) throw new Error("token refresh failed");
    tokens = refreshed;
    updateConnectionTokens(db, connectionId, encryptJson(tokens, key), "active");
  }
  return tokens;
}

export async function runPublish(input: {
  db: GrowthDb;
  key: Buffer;
  mediaDir: string;
  publicBase: string;
  item: Item;
  destination: Destination;
  slotId?: string | null;
  campaign?: string;
}): Promise<Job> {
  const job = insertJob(input.db, {
    id: nid(),
    itemId: input.item.id,
    destinationId: input.destination.id,
    slotId: input.slotId ?? null,
    network: input.destination.network,
    status: "uploading"
  });
  try {
    const adapter = publisher(input.destination.network);
    const tokens = await freshTokens(input.db, input.destination.connectionId, input.key, input.destination.network);
    const copy = publishCopy(input.item, input.destination.network, input.campaign);
    const config = DestinationConfigSchema.parse(input.destination.config);
    const media = mediaOf(input.item, input.mediaDir, input.publicBase);
    const preview = adapter.preview(
      media.map((file) => file.item),
      copy,
      config
    );
    if (!preview.accepted) {
      return updateJob(input.db, job.id, {
        status: "failed",
        lastError: preview.errors.join(", ") || "rejected",
        errorCode: "validation",
        attempts: 1
      })!;
    }
    const result = await adapter.publish({
      tokens,
      destination: {
        id: input.destination.id,
        kind: input.destination.kind as "channel",
        externalId: input.destination.externalId,
        name: input.destination.name,
        handle: input.destination.handle,
        config
      },
      copy,
      preview,
      media,
      mode: "now"
    });
    return applyResult(input.db, job.id, result);
  } catch (error) {
    const connection = getConnection(input.db, input.destination.connectionId);
    if (connection && errorCodeOf(error) === "auth_expired") updateConnectionTokens(input.db, connection.id, connection.encryptedTokens, "needs_reauth");
    return updateJob(input.db, job.id, {
      status: "failed",
      lastError: error instanceof Error ? error.message : String(error),
      errorCode: errorCodeOf(error),
      attempts: job.attempts + 1
    })!;
  }
}

function applyResult(db: GrowthDb, jobId: string, result: PublishHandle): Job {
  if (result.status === "processing") {
    return updateJob(db, jobId, {
      status: "processing",
      remotePostId: result.remotePostId ?? null,
      remoteUrl: result.remoteUrl ?? null,
      handle: result.poll ?? {},
      attempts: 1
    })!;
  }
  const job = updateJob(db, jobId, {
    status: result.status === "draft" ? "draft" : "published",
    remotePostId: result.remotePostId ?? null,
    remoteUrl: result.remoteUrl ?? null,
    handle: result.poll ?? result.nativePayload ?? {},
    publishedAt: new Date().toISOString(),
    lastError: result.status === "draft" ? "Waiting in the network inbox. Finish it in the app." : null,
    attempts: 1
  })!;
  if (job.network === "facebook" && job.status === "published") queueGroupShares(db, job, nid);
  return job;
}

export async function pollPublish(db: GrowthDb, key: Buffer, jobId: string): Promise<Job | null> {
  const job = getJob(db, jobId);
  if (!job || job.status !== "processing" || !job.destinationId) return job;
  const destination = getDestination(db, job.destinationId);
  if (!destination) return job;
  const adapter = publisher(job.network);
  if (!("poll" in adapter) || typeof adapter.poll !== "function") return job;
  try {
    const tokens = await freshTokens(db, destination.connectionId, key, job.network);
    const config = DestinationConfigSchema.parse(destination.config);
    const result = await adapter.poll({
      tokens,
      destination: {
        id: destination.id,
        kind: destination.kind as "channel",
        externalId: destination.externalId,
        name: destination.name,
        handle: destination.handle,
        config
      },
      handle: job.handle
    });
    return applyResult(db, job.id, result);
  } catch (error) {
    return updateJob(db, job.id, {
      status: "failed",
      lastError: error instanceof Error ? error.message : String(error),
      errorCode: errorCodeOf(error)
    });
  }
}

export function mergePageTokens(tokens: SocialTokens, network: string, drafts: Array<{ externalId: string; config?: { pageAccessToken?: string; categoryId?: string } }>): SocialTokens {
  const pageTokens = { ...(tokens.pageTokens ?? {}) };
  for (const draft of drafts) {
    const pageToken = draft.config?.pageAccessToken;
    const pageId = network === "instagram" ? draft.config?.categoryId : draft.externalId;
    if (pageToken && pageId) pageTokens[pageId] = pageToken;
  }
  return { ...tokens, pageTokens };
}

export function publicConfig(config: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!config) return {};
  const next = { ...config };
  delete next.pageAccessToken;
  return next;
}

export type { ItemCopy };
