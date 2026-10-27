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
import {
  DestinationConfigSchema,
  networkSupportsFirstComment,
  planFirstComment,
  SOCIAL_NETWORKS,
  type FirstCommentPlan,
  type PackageCopyInput,
  type PackageMediaItem,
  type SocialNetwork
} from "@studio/shared";
import { captionFromHandle, composeFreshCopy, type CaptionLock } from "./angles.js";
import type { ItemCopy } from "./copy.js";
import { decryptJson, encryptJson, nid } from "./crypto.js";
import {
  getConnection,
  getDestination,
  getItem,
  getJob,
  getSlot,
  insertJob,
  listJobs,
  queueGroupPosts,
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

function publishConfig(network: string, raw: unknown, link?: string) {
  const parsed = DestinationConfigSchema.parse(raw ?? {});
  if (!networkSupportsFirstComment(network)) return parsed;
  return {
    ...parsed,
    firstComment: parsed.firstComment?.trim() || link,
    firstCommentDelayMinutes: parsed.firstCommentDelayMinutes ?? 2,
    linkInFirstComment: true
  };
}

function canComment(adapter: ReturnType<typeof publisher>): adapter is ReturnType<typeof publisher> & {
  commentOnPost: NonNullable<ReturnType<typeof getNetworkAdapter>["commentOnPost"]>;
} {
  return typeof (adapter as { commentOnPost?: unknown }).commentOnPost === "function";
}

export type PublishCopyOptions = {
  seed?: string;
  recentBodies?: string[];
  locked?: CaptionLock | null;
};

function trendCaption(item: Item, locked?: CaptionLock | null): CaptionLock | null {
  if (locked?.body?.trim()) return locked;
  if (item.source !== "youtube-trend") return null;
  const title = item.copy.youtube?.title?.trim() || item.title;
  const body = item.copy.youtube?.body?.trim();
  if (!body) return null;
  return { angleKind: "outcome", frame: 0, title: title.slice(0, 90), body };
}

export function publishCopy(item: Item, network: string, campaign?: string, options?: PublishCopyOptions): PackageCopyInput {
  const caption = composeFreshCopy({
    item,
    network,
    seed: options?.seed ?? `${item.id}:${network}`,
    recentBodies: options?.recentBodies,
    locked: trendCaption(item, options?.locked)
  });
  const link = trackedLink({ network, slug: item.slug, format: formatForNetwork(network), campaign });
  const parkLink = networkSupportsFirstComment(network);
  const body = parkLink ? caption.body : applyLink(caption.body, link);
  return {
    title: caption.title || item.title,
    body,
    hashtags: body.includes("#") ? [] : item.copy.hashtags,
    language: item.language,
    link: parkLink ? link : undefined
  };
}

export function recentCaptionBodies(db: GrowthDb, network: string, exceptJobId?: string): string[] {
  return listJobs(db)
    .filter((job) => job.network === network && job.id !== exceptJobId)
    .slice(0, 12)
    .map((job) => captionFromHandle(job.handle)?.body)
    .filter((body): body is string => Boolean(body?.trim()));
}

export function lockPublishCopy(input: {
  db: GrowthDb;
  job: Job;
  item: Item;
  network: string;
  campaign?: string;
}): { copy: PackageCopyInput; caption: CaptionLock } {
  const stored = captionFromHandle(input.job.handle);
  const slot = input.job.slotId ? getSlot(input.db, input.job.slotId) : null;
  const seed = input.job.slotId
    ? `${input.job.slotId}:${slot?.scheduledFor ?? input.job.scheduledFor ?? ""}`
    : input.job.id;
  const caption = composeFreshCopy({
    item: input.item,
    network: input.network,
    seed,
    recentBodies: recentCaptionBodies(input.db, input.network, input.job.id),
    locked: trendCaption(input.item, stored)
  });
  if (!stored) {
    updateJob(input.db, input.job.id, { handle: { ...input.job.handle, caption } });
  }
  return {
    caption,
    copy: publishCopy(input.item, input.network, input.campaign, { locked: caption })
  };
}

export function mediaOf(item: Item, mediaDir: string, publicBase: string): PublishMediaFile[] {
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

export async function freshConnectionTokens(db: GrowthDb, connectionId: string, key: Buffer, network: string): Promise<SocialTokens> {
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
  const { copy } = lockPublishCopy({
    db: input.db,
    job,
    item: input.item,
    network: input.destination.network,
    campaign: input.campaign
  });
  try {
    const adapter = publisher(input.destination.network);
    const tokens = await freshConnectionTokens(input.db, input.destination.connectionId, input.key, input.destination.network);
    const config = publishConfig(input.destination.network, input.destination.config, copy.link);
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
    return applyResult(input.db, job.id, result, { copy, config, network: input.destination.network });
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

function applyResult(
  db: GrowthDb,
  jobId: string,
  result: PublishHandle,
  extras?: { copy?: PackageCopyInput; config?: ReturnType<typeof publishConfig>; network?: string }
): Job {
  const current = getJob(db, jobId);
  const caption = current?.handle.caption;
  const handle = { ...(current?.handle ?? {}), ...(result.poll ?? result.nativePayload ?? {}) };
  if (caption) handle.caption = caption;
  if (result.status === "published" && extras?.network && extras.config) {
    const existing = handle.firstComment as FirstCommentPlan | undefined;
    if (!existing || existing.status === "planned") {
      const planned = planFirstComment({
        text: extras.config.firstComment || extras.copy?.link || "",
        delayMinutes: extras.config.firstCommentDelayMinutes
      });
      if (planned) handle.firstComment = planned;
    }
  }
  if (result.status === "processing") {
    return updateJob(db, jobId, {
      status: "processing",
      remotePostId: result.remotePostId ?? null,
      remoteUrl: result.remoteUrl ?? null,
      handle,
      attempts: (current?.attempts ?? 0) + 1
    })!;
  }
  const job = updateJob(db, jobId, {
    status: result.status === "draft" ? "draft" : "published",
    remotePostId: result.remotePostId ?? null,
    remoteUrl: result.remoteUrl ?? null,
    handle,
    publishedAt: new Date().toISOString(),
    lastError: result.status === "draft" ? "Waiting in the network inbox. Finish it in the app." : null,
    attempts: (current?.attempts ?? 0) + 1
  })!;
  if (job.status === "published") queueGroupPosts(db, { itemId: job.itemId, jobId: job.id, network: job.network }, nid);
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
    const tokens = await freshConnectionTokens(db, destination.connectionId, key, job.network);
    const item = getItem(db, job.itemId);
    const copy = item
      ? lockPublishCopy({ db, job, item, network: job.network }).copy
      : { hashtags: [] as string[] };
    const config = publishConfig(job.network, destination.config, copy.link);
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
    return applyResult(db, job.id, result, { copy, config, network: job.network });
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

export async function retryPublish(input: {
  db: GrowthDb;
  key: Buffer;
  mediaDir: string;
  publicBase: string;
  jobId: string;
  campaign?: string;
}): Promise<{ job: Job | null; error?: string }> {
  const job = getJob(input.db, input.jobId);
  if (!job) return { job: null, error: "not_found" };
  if (job.status !== "failed") return { job, error: "not_failed" };
  if (!job.destinationId) return { job, error: "no_destination" };
  const destination = getDestination(input.db, job.destinationId);
  const item = getItem(input.db, job.itemId);
  if (!destination || !item) return { job, error: "no_destination" };
  updateJob(input.db, job.id, { status: "uploading", lastError: null, errorCode: null });
  const current = getJob(input.db, job.id) ?? job;
  const { copy } = lockPublishCopy({
    db: input.db,
    job: current,
    item,
    network: destination.network,
    campaign: input.campaign
  });
  try {
    const adapter = publisher(destination.network);
    const tokens = await freshConnectionTokens(input.db, destination.connectionId, input.key, destination.network);
    const config = publishConfig(destination.network, destination.config, copy.link);
    const media = mediaOf(item, input.mediaDir, input.publicBase);
    const preview = adapter.preview(
      media.map((file) => file.item),
      copy,
      config
    );
    if (!preview.accepted) {
      return {
        job: updateJob(input.db, job.id, {
          status: "failed",
          lastError: preview.errors.join(", ") || "rejected",
          errorCode: "validation",
          attempts: job.attempts + 1
        })
      };
    }
    const result = await adapter.publish({
      tokens,
      destination: {
        id: destination.id,
        kind: destination.kind as "channel",
        externalId: destination.externalId,
        name: destination.name,
        handle: destination.handle,
        config
      },
      copy,
      preview,
      media,
      mode: "now"
    });
    return { job: applyResult(input.db, job.id, result, { copy, config, network: destination.network }) };
  } catch (error) {
    const connection = getConnection(input.db, destination.connectionId);
    if (connection && errorCodeOf(error) === "auth_expired") {
      updateConnectionTokens(input.db, connection.id, connection.encryptedTokens, "needs_reauth");
    }
    return {
      job: updateJob(input.db, job.id, {
        status: "failed",
        lastError: error instanceof Error ? error.message : String(error),
        errorCode: errorCodeOf(error),
        attempts: job.attempts + 1
      }),
      error: "publish_failed"
    };
  }
}

export async function postDueFirstComments(input: {
  db: GrowthDb;
  key: Buffer;
  now?: Date;
}): Promise<number> {
  const nowIso = (input.now ?? new Date()).toISOString();
  let posted = 0;
  for (const job of listPublishedWithComments(input.db)) {
    const planned = job.handle.firstComment as FirstCommentPlan | undefined;
    if (!planned || planned.status !== "pending" || !planned.at || planned.at > nowIso || !job.remotePostId || !job.destinationId) {
      continue;
    }
    const destination = getDestination(input.db, job.destinationId);
    if (!destination) continue;
    const adapter = publisher(job.network);
    if (!canComment(adapter)) {
      updateJob(input.db, job.id, {
        handle: { ...job.handle, firstComment: { ...planned, status: "failed", error: "adapter does not support comments" } }
      });
      continue;
    }
    try {
      const tokens = await freshConnectionTokens(input.db, destination.connectionId, input.key, job.network);
      const config = DestinationConfigSchema.parse(destination.config);
      const result = await adapter.commentOnPost({
        tokens,
        destination: {
          id: destination.id,
          kind: destination.kind as "channel",
          externalId: destination.externalId,
          name: destination.name,
          handle: destination.handle,
          config
        },
        remotePostId: job.remotePostId,
        text: planned.text
      });
      updateJob(input.db, job.id, {
        handle: { ...job.handle, firstComment: { ...planned, status: "posted", commentId: result.commentId, error: undefined } }
      });
      posted += 1;
    } catch (error) {
      updateJob(input.db, job.id, {
        handle: {
          ...job.handle,
          firstComment: {
            ...planned,
            status: "failed",
            error: (error instanceof Error ? error.message : String(error)).slice(0, 500)
          }
        }
      });
    }
  }
  return posted;
}

function listPublishedWithComments(db: GrowthDb): Job[] {
  return listJobs(db).filter((job) => job.status === "published" && Boolean(job.handle.firstComment));
}

export type { ItemCopy };
