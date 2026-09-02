import {
  DestinationConfigSchema,
  PackageCopySchema,
  PackageMediaItemSchema,
  type ContentPackageView,
  type DestinationConfig,
  type PackageCopy,
  type PackageMediaItem,
  type PublishJobView,
  type SocialConnectionView,
  type SocialDestinationView
} from "@studio/shared";
import type { ContentPackage, PublishJob, SocialConnection, SocialDestination } from "@studio/infra-prisma";
import {
  fromPrismaAuthKind,
  fromPrismaConnectionStatus,
  fromPrismaDestinationKind,
  fromPrismaDestinationStatus,
  fromPrismaJobStatus,
  fromPrismaNetwork,
  fromPrismaPackageSource,
  fromPrismaPublishMode
} from "./map.js";

export function parseMedia(value: unknown): PackageMediaItem[] {
  const parsed = PackageMediaItemSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseCopy(value: unknown): PackageCopy {
  const parsed = PackageCopySchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { hashtags: [], mentions: [] };
}

export function parseDestConfig(value: unknown): DestinationConfig {
  const parsed = DestinationConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

export function connectionView(row: SocialConnection): SocialConnectionView {
  return {
    id: row.id,
    network: fromPrismaNetwork(row.network),
    authKind: fromPrismaAuthKind(row.authKind),
    externalUserId: row.externalUserId,
    displayName: row.displayName,
    handle: row.handle,
    avatarUrl: row.avatarUrl,
    scopes: row.scopes,
    status: fromPrismaConnectionStatus(row.status),
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export function destinationView(row: SocialDestination & { connection?: SocialConnection }): SocialDestinationView {
  const config = parseDestConfig(row.config);
  const { pageAccessToken: _token, ...safeConfig } = config;
  return {
    id: row.id,
    connectionId: row.connectionId,
    network: row.connection ? fromPrismaNetwork(row.connection.network) : "telegram",
    kind: fromPrismaDestinationKind(row.kind),
    externalId: row.externalId,
    name: row.name,
    handle: row.handle,
    url: row.url,
    isDefault: row.isDefault,
    status: fromPrismaDestinationStatus(row.status),
    config: safeConfig,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null
  };
}

export function jobView(
  row: PublishJob & { destination?: SocialDestination & { connection?: SocialConnection } }
): PublishJobView {
  return {
    id: row.id,
    packageId: row.packageId,
    destinationId: row.destinationId,
    network: row.destination?.connection ? fromPrismaNetwork(row.destination.connection.network) : undefined,
    destinationName: row.destination?.name,
    status: fromPrismaJobStatus(row.status),
    remotePostId: row.remotePostId,
    remoteUrl: row.remoteUrl,
    attempts: row.attempts,
    lastError: row.lastError,
    errorCode: row.errorCode,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export function packageView(
  row: ContentPackage & {
    jobs?: Array<PublishJob & { destination?: SocialDestination & { connection?: SocialConnection } }>;
  }
): ContentPackageView {
  return {
    id: row.id,
    source: fromPrismaPackageSource(row.source),
    runId: row.runId,
    media: parseMedia(row.media),
    copy: parseCopy(row.copy),
    coverGcsPath: row.coverGcsPath,
    mode: fromPrismaPublishMode(row.mode),
    scheduleAt: row.scheduleAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    jobs: (row.jobs ?? []).map(jobView)
  };
}
