import { prisma, Prisma, type SocialDestinationKind as PrismaDestinationKind, type SocialNetwork as PrismaNetwork } from "@studio/infra-prisma";
import { decryptTokens, encryptTokens, gcsClient, getNetworkAdapter, SocialApiError, tokenExpired, type PublishMediaFile } from "@studio/providers";
import { firstCommentDelayMs, planFirstComment, type FirstCommentPlan } from "@studio/shared";
import { enqueuePublishJob } from "./queue.js";
import { fromPrismaDestinationKind, fromPrismaNetwork, toPrismaConnectionStatus, toPrismaJobStatus } from "./map.js";
import { mergeDestConfig, parseCopy, parseDestConfig, parseMedia } from "./views.js";

type DistributionRunOpts = { poll?: boolean; comment?: boolean };

function normalizeRunOpts(opts: boolean | DistributionRunOpts = false): DistributionRunOpts {
  return typeof opts === "boolean" ? { poll: opts } : opts;
}

function handleRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function firstCommentFromHandle(value: unknown): FirstCommentPlan | undefined {
  const handle = handleRecord(value);
  const raw = handle.firstComment;
  if (!raw || typeof raw !== "object") return undefined;
  const comment = raw as FirstCommentPlan;
  if (typeof comment.text !== "string" || !comment.text.trim()) return undefined;
  return comment;
}

function errorCodeOf(error: unknown): string {
  if (error instanceof SocialApiError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/unauthor|expired|401|403/i.test(message)) return "auth_expired";
  if (/429|rate/i.test(message)) return "rate_limited";
  return "upload_failed";
}

export async function runDistributionJob(publishJobId: string, opts: boolean | DistributionRunOpts = false): Promise<void> {
  const flags = normalizeRunOpts(opts);
  const job = await prisma.publishJob.findUnique({
    where: { id: publishJobId },
    include: {
      package: true,
      destination: { include: { connection: true } }
    }
  });
  if (!job) return;
  if (job.status === "cancelled") return;
  if (flags.comment) {
    await runFirstComment(job);
    return;
  }
  if (job.status === "published") return;
  if (job.remotePostId && !flags.poll) return;

  const connection = job.destination.connection;
  if (!connection.encryptedTokens) {
    await failJob(job.id, "missing tokens", "auth_expired");
    return;
  }
  if (connection.status !== "active" && connection.status !== "expired") {
    await failJob(job.id, `connection ${connection.status}`, "auth_expired");
    return;
  }

  const adapter = getNetworkAdapter(fromPrismaNetwork(connection.network));
  let tokens = decryptTokens(connection.encryptedTokens);
  if (tokenExpired(tokens) && adapter.refreshAuth) {
    try {
      const refreshed = await adapter.refreshAuth(tokens);
      if (refreshed) {
        tokens = refreshed;
        await prisma.socialConnection.update({
          where: { id: connection.id },
          data: { encryptedTokens: encryptTokens(refreshed), status: "active" }
        });
      }
    } catch (error) {
      await prisma.socialConnection.update({
        where: { id: connection.id },
        data: { status: toPrismaConnectionStatus("needs_reauth") }
      });
      await failJob(job.id, error instanceof Error ? error.message : "token refresh failed", "auth_expired");
      return;
    }
  }

  await prisma.publishJob.update({
    where: { id: job.id },
    data: { status: toPrismaJobStatus(flags.poll ? "processing" : "transforming"), attempts: { increment: 1 } }
  });

  const copy = parseCopy(job.package.copy);
  const mediaItems = parseMedia(job.package.media);
  const destConfig = mergeDestConfig(job.destination.config, job.package.overrides, job.destinationId);
  const preview = adapter.preview(mediaItems, copy, destConfig);

  if (!flags.poll && !preview.accepted) {
    await failJob(job.id, preview.errors.join(", ") || "rejected by adapter", "validation");
    return;
  }

  try {
    if (flags.poll) {
      if (!adapter.poll) {
        await failJob(job.id, "adapter does not support polling", "validation");
        return;
      }
      const handle = (job.publishHandle ?? {}) as Record<string, unknown>;
      const result = await adapter.poll({
        tokens,
        destination: {
          id: job.destination.id,
          kind: fromPrismaDestinationKind(job.destination.kind),
          externalId: job.destination.externalId,
          name: job.destination.name,
          handle: job.destination.handle,
          config: destConfig
        },
        handle
      });
      await applyPublishResult(job, result);
      return;
    }

    const storage = gcsClient();
    const files: PublishMediaFile[] = [];
    for (const item of [preview.selectedMedia, ...preview.extraMedia].filter(Boolean)) {
      if (!item) continue;
      const downloaded = await storage.download(item.gcsPath);
      const publicUrl = await storage.signedUrl(item.gcsPath, 6 * 3600);
      files.push({
        item,
        body: downloaded.body,
        mimeType: downloaded.mimeType || item.mimeType,
        filename: item.filename || item.gcsPath.split("/").pop() || "media.bin",
        publicUrl
      });
    }
    let cover: PublishMediaFile | undefined;
    if (job.package.coverGcsPath) {
      const downloaded = await storage.download(job.package.coverGcsPath);
      cover = {
        item: {
          kind: "image",
          gcsPath: job.package.coverGcsPath,
          mimeType: downloaded.mimeType
        },
        body: downloaded.body,
        mimeType: downloaded.mimeType,
        filename: "cover.jpg",
        publicUrl: await storage.signedUrl(job.package.coverGcsPath, 6 * 3600)
      };
    }

    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: "uploading",
        nativePayload: preview as unknown as Prisma.InputJsonValue
      }
    });

    const result = await adapter.publish({
      tokens,
      destination: {
        id: job.destination.id,
        kind: fromPrismaDestinationKind(job.destination.kind),
        externalId: job.destination.externalId,
        name: job.destination.name,
        handle: job.destination.handle,
        config: destConfig
      },
      copy,
      preview,
      media: files,
      cover,
      scheduleAt: job.scheduledFor,
      mode: job.package.mode
    });
    await applyPublishResult(job, result);
  } catch (error) {
    const code = errorCodeOf(error);
    if (code === "auth_expired") {
      await prisma.socialConnection.update({
        where: { id: connection.id },
        data: { status: toPrismaConnectionStatus("needs_reauth") }
      });
    }
    await failJob(job.id, error instanceof Error ? error.message : String(error), code);
    throw error;
  }
}

async function applyPublishResult(
  job: {
    id: string;
    publishHandle: unknown;
    nativePayload: unknown;
    destinationId?: string;
    destination: { config: unknown; connection: { network: unknown } };
    package: { copy: unknown; overrides?: unknown };
  },
  result: { status: "published" | "processing" | "draft"; remotePostId?: string; remoteUrl?: string; poll?: Record<string, unknown>; nativePayload?: Record<string, unknown> }
) {
  const handle = { ...handleRecord(job.publishHandle), ...(result.poll ?? {}) };
  if (result.status === "processing") {
    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: "processing",
        publishHandle: handle as Prisma.InputJsonValue,
        remotePostId: result.remotePostId,
        remoteUrl: result.remoteUrl
      }
    });
    await enqueuePublishJob(job.id, { poll: true, delayMs: 8_000 });
    return;
  }
  if (result.status === "draft") {
    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: "published",
        remotePostId: result.remotePostId,
        remoteUrl: result.remoteUrl,
        publishedAt: new Date(),
        nativePayload: (result.nativePayload ?? {}) as Prisma.InputJsonValue
      }
    });
    return;
  }
  const planned = maybePlanFirstComment(job, handle);
  if (planned) handle.firstComment = planned;
  await prisma.publishJob.update({
    where: { id: job.id },
    data: {
      status: "published",
      remotePostId: result.remotePostId,
      remoteUrl: result.remoteUrl,
      publishedAt: new Date(),
      lastError: null,
      errorCode: null,
      publishHandle: handle as Prisma.InputJsonValue,
      nativePayload: (result.nativePayload ?? {}) as Prisma.InputJsonValue
    }
  });
  if (planned && result.remotePostId) {
    await enqueuePublishJob(job.id, { comment: true, delayMs: firstCommentDelayMs({ firstCommentDelayMinutes: planned.delayMinutes }) });
  }
}

function maybePlanFirstComment(
  job: {
    publishHandle: unknown;
    nativePayload: unknown;
    destinationId?: string;
    destination: { config: unknown };
    package: { copy: unknown; overrides?: unknown };
  },
  handle: Record<string, unknown>
): FirstCommentPlan | null {
  const existing = firstCommentFromHandle(handle);
  if (existing?.status === "posted") return null;
  if (existing?.status === "pending" || existing?.status === "planned") {
    return planFirstComment({ text: existing.text, delayMinutes: existing.delayMinutes });
  }
  const destConfig = mergeDestConfig(job.destination.config, job.package.overrides, job.destinationId);
  const copy = parseCopy(job.package.copy);
  const preview = job.nativePayload as { nativeCopy?: { firstComment?: string } } | null;
  const text = (preview?.nativeCopy?.firstComment || destConfig.firstComment || (destConfig.linkInFirstComment ? copy.link : "") || "").trim();
  return planFirstComment({ text, delayMinutes: destConfig.firstCommentDelayMinutes ?? existing?.delayMinutes });
}

async function runFirstComment(job: {
  id: string;
  status: string;
  remotePostId: string | null;
  publishHandle: unknown;
  destination: {
    id: string;
    kind: PrismaDestinationKind;
    externalId: string;
    name: string;
    handle: string | null;
    config: unknown;
    connection: { network: PrismaNetwork; encryptedTokens: string | null; status: string; id: string };
  };
}): Promise<void> {
  if (job.status !== "published" || !job.remotePostId) return;
  const planned = firstCommentFromHandle(job.publishHandle);
  if (!planned || planned.status === "posted") return;
  const adapter = getNetworkAdapter(fromPrismaNetwork(job.destination.connection.network));
  if (!adapter.commentOnPost) {
    await storeFirstComment(job.id, job.publishHandle, { ...planned, status: "failed", error: "adapter does not support comments" });
    return;
  }
  const connection = job.destination.connection;
  if (!connection.encryptedTokens) {
    await storeFirstComment(job.id, job.publishHandle, { ...planned, status: "failed", error: "missing tokens" });
    return;
  }
  let tokens = decryptTokens(connection.encryptedTokens);
  if (tokenExpired(tokens) && adapter.refreshAuth) {
    const refreshed = await adapter.refreshAuth(tokens).catch(() => null);
    if (refreshed) {
      tokens = refreshed;
      await prisma.socialConnection.update({
        where: { id: connection.id },
        data: { encryptedTokens: encryptTokens(refreshed), status: "active" }
      });
    }
  }
  try {
    const destConfig = parseDestConfig(job.destination.config);
    const posted = await adapter.commentOnPost({
      tokens,
      destination: {
        id: job.destination.id,
        kind: fromPrismaDestinationKind(job.destination.kind),
        externalId: job.destination.externalId,
        name: job.destination.name,
        handle: job.destination.handle,
        config: destConfig
      },
      remotePostId: job.remotePostId,
      text: planned.text
    });
    await storeFirstComment(job.id, job.publishHandle, {
      ...planned,
      status: "posted",
      commentId: posted.commentId,
      error: undefined
    });
  } catch (error) {
    await storeFirstComment(job.id, job.publishHandle, {
      ...planned,
      status: "failed",
      error: (error instanceof Error ? error.message : String(error)).slice(0, 500)
    });
  }
}

async function storeFirstComment(jobId: string, current: unknown, firstComment: FirstCommentPlan): Promise<void> {
  const handle = handleRecord(current);
  handle.firstComment = firstComment;
  await prisma.publishJob.update({
    where: { id: jobId },
    data: { publishHandle: handle as Prisma.InputJsonValue }
  });
}

async function failJob(jobId: string, message: string, code: string) {
  await prisma.publishJob.update({
    where: { id: jobId },
    data: { status: "failed", lastError: message.slice(0, 2000), errorCode: code }
  });
}
