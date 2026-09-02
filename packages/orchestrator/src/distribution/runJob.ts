import { prisma, Prisma } from "@studio/infra-prisma";
import { decryptTokens, encryptTokens, gcsClient, getNetworkAdapter, SocialApiError, tokenExpired, type PublishMediaFile } from "@studio/providers";
import { enqueuePublishJob } from "./queue.js";
import { fromPrismaDestinationKind, fromPrismaNetwork, toPrismaConnectionStatus, toPrismaJobStatus } from "./map.js";
import { parseCopy, parseDestConfig, parseMedia } from "./views.js";

function errorCodeOf(error: unknown): string {
  if (error instanceof SocialApiError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/unauthor|expired|401|403/i.test(message)) return "auth_expired";
  if (/429|rate/i.test(message)) return "rate_limited";
  return "upload_failed";
}

export async function runDistributionJob(publishJobId: string, poll = false): Promise<void> {
  const job = await prisma.publishJob.findUnique({
    where: { id: publishJobId },
    include: {
      package: true,
      destination: { include: { connection: true } }
    }
  });
  if (!job) return;
  if (job.status === "cancelled" || job.status === "published") return;
  if (job.remotePostId && !poll) return;

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
    data: { status: toPrismaJobStatus(poll ? "processing" : "transforming"), attempts: { increment: 1 } }
  });

  const copy = parseCopy(job.package.copy);
  const mediaItems = parseMedia(job.package.media);
  const destConfig = parseDestConfig(job.destination.config);
  const preview = adapter.preview(mediaItems, copy, destConfig);

  if (!poll && !preview.accepted) {
    await failJob(job.id, preview.errors.join(", ") || "rejected by adapter", "validation");
    return;
  }

  try {
    if (poll) {
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
      await applyPublishResult(job.id, result);
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
    await applyPublishResult(job.id, result);
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
  jobId: string,
  result: { status: "published" | "processing" | "draft"; remotePostId?: string; remoteUrl?: string; poll?: Record<string, unknown>; nativePayload?: Record<string, unknown> }
) {
  if (result.status === "processing") {
    await prisma.publishJob.update({
      where: { id: jobId },
      data: {
        status: "processing",
        publishHandle: (result.poll ?? {}) as Prisma.InputJsonValue,
        remotePostId: result.remotePostId,
        remoteUrl: result.remoteUrl
      }
    });
    await enqueuePublishJob(jobId, { poll: true, delayMs: 8_000 });
    return;
  }
  if (result.status === "draft") {
    await prisma.publishJob.update({
      where: { id: jobId },
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
  await prisma.publishJob.update({
    where: { id: jobId },
    data: {
      status: "published",
      remotePostId: result.remotePostId,
      remoteUrl: result.remoteUrl,
      publishedAt: new Date(),
      lastError: null,
      errorCode: null,
      publishHandle: (result.poll ?? {}) as Prisma.InputJsonValue,
      nativePayload: (result.nativePayload ?? {}) as Prisma.InputJsonValue
    }
  });
}

async function failJob(jobId: string, message: string, code: string) {
  await prisma.publishJob.update({
    where: { id: jobId },
    data: { status: "failed", lastError: message.slice(0, 2000), errorCode: code }
  });
}
