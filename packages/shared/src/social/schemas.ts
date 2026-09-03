import { z } from "zod";
import {
  ContentPackageSourceSchema,
  PackageMediaKindSchema,
  PublishJobStatusSchema,
  PublishModeSchema,
  SocialAuthKindSchema,
  SocialConnectionStatusSchema,
  SocialDestinationKindSchema,
  SocialDestinationStatusSchema,
  SocialNetworkSchema
} from "./enums.js";

export const PackageMediaItemSchema = z.object({
  kind: PackageMediaKindSchema,
  gcsPath: z.string().min(1),
  mimeType: z.string().min(1),
  filename: z.string().max(240).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  sizeBytes: z.number().int().nonnegative().optional()
});
export type PackageMediaItem = z.infer<typeof PackageMediaItemSchema>;

export const PackageCopySchema = z.object({
  title: z.string().max(300).optional(),
  body: z.string().max(20_000).optional(),
  hashtags: z.array(z.string().max(100)).max(50).default([]),
  mentions: z.array(z.string().max(100)).max(50).default([]),
  link: z.string().url().max(500).optional(),
  language: z.string().max(16).optional(),
  altText: z.string().max(2000).optional()
});
export type PackageCopy = z.infer<typeof PackageCopySchema>;
export type PackageCopyInput = z.input<typeof PackageCopySchema>;

export const DestinationConfigSchema = z.object({
  privacy: z.enum(["public", "unlisted", "private"]).optional(),
  timezone: z.string().max(80).optional(),
  copyTemplate: z.string().max(4000).optional(),
  firstComment: z.string().max(2000).optional(),
  notifyFollowers: z.boolean().optional(),
  madeForKids: z.boolean().optional(),
  categoryId: z.string().max(40).optional(),
  disableComment: z.boolean().optional(),
  autoPublish: z.boolean().optional(),
  premiumCopyLimit: z.boolean().optional(),
  pageAccessToken: z.string().optional()
});
export type DestinationConfig = z.infer<typeof DestinationConfigSchema>;

export const CapabilityManifestSchema = z.object({
  media: z.array(z.enum(["video", "image", "carousel", "text", "story"])),
  limits: z.object({
    maxDurationMs: z.number().int().positive().optional(),
    maxBytes: z.number().int().positive().optional(),
    aspects: z.array(z.string()).optional(),
    codecs: z.array(z.string()).optional(),
    captionChars: z.number().int().nonnegative().optional(),
    titleChars: z.number().int().nonnegative().optional(),
    imageCount: z.number().int().positive().optional()
  }),
  features: z.object({
    scheduleNative: z.boolean(),
    cover: z.boolean(),
    firstComment: z.boolean(),
    privacy: z.boolean(),
    location: z.boolean(),
    altText: z.boolean(),
    playlist: z.boolean(),
    notifyFollowers: z.boolean()
  }),
  publishProtocol: z.enum(["sync", "resumable", "container_then_publish", "inbox_draft"]),
  strictAspect: z.boolean().optional()
});
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

export const TransformChangeSchema = z.object({
  field: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  reason: z.string()
});
export type TransformChange = z.infer<typeof TransformChangeSchema>;

export const NativeCopySchema = z.object({
  title: z.string().optional(),
  caption: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  firstComment: z.string().optional(),
  privacy: z.string().optional(),
  isShort: z.boolean().optional()
});
export type NativeCopy = z.infer<typeof NativeCopySchema>;

export const TransformPreviewSchema = z.object({
  accepted: z.boolean(),
  lossy: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  changes: z.array(TransformChangeSchema),
  nativeCopy: NativeCopySchema,
  selectedMedia: PackageMediaItemSchema.nullable(),
  extraMedia: z.array(PackageMediaItemSchema)
});
export type TransformPreview = z.infer<typeof TransformPreviewSchema>;

export const IngestMediaSchema = z.union([
  z.object({
    artifactId: z.string().min(1)
  }),
  z.object({
    url: z.string().url(),
    kind: PackageMediaKindSchema.optional(),
    filename: z.string().max(240).optional()
  }),
  z.object({
    base64: z.string().min(1),
    filename: z.string().min(1).max(240),
    mimeType: z.string().min(1),
    kind: PackageMediaKindSchema.optional()
  }),
  z.object({
    gcsPath: z.string().min(1),
    mimeType: z.string().min(1),
    kind: PackageMediaKindSchema,
    filename: z.string().max(240).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    sizeBytes: z.number().int().nonnegative().optional()
  })
]);
export type IngestMedia = z.infer<typeof IngestMediaSchema>;

export const CreateContentPackageRequestSchema = z.object({
  source: ContentPackageSourceSchema.default("api"),
  runId: z.string().min(1).optional(),
  artifactId: z.string().min(1).optional(),
  media: z.array(IngestMediaSchema).max(10).default([]),
  copy: PackageCopySchema.default({}),
  cover: IngestMediaSchema.optional(),
  destinationIds: z.array(z.string().min(1)).min(1).max(50),
  mode: PublishModeSchema.default("now"),
  scheduleAt: z.string().datetime().optional(),
  confirmLossy: z.boolean().optional(),
  overrides: z.record(z.string(), DestinationConfigSchema).optional()
});
export type CreateContentPackageRequest = z.infer<typeof CreateContentPackageRequestSchema>;

export const PreviewPackageRequestSchema = z.object({
  media: z.array(PackageMediaItemSchema).max(10).default([]),
  copy: PackageCopySchema.default({}),
  destinationIds: z.array(z.string().min(1)).min(1).max(50)
});
export type PreviewPackageRequest = z.infer<typeof PreviewPackageRequestSchema>;

export const ConnectTelegramRequestSchema = z.object({
  botToken: z.string().min(20).max(200)
});
export type ConnectTelegramRequest = z.infer<typeof ConnectTelegramRequestSchema>;

export const ResolveTelegramChatRequestSchema = z.object({
  chatId: z.string().min(1).max(80)
});
export type ResolveTelegramChatRequest = z.infer<typeof ResolveTelegramChatRequestSchema>;

export const PatchDestinationRequestSchema = z.object({
  status: SocialDestinationStatusSchema.optional(),
  isDefault: z.boolean().optional(),
  config: DestinationConfigSchema.optional(),
  name: z.string().min(1).max(200).optional()
});
export type PatchDestinationRequest = z.infer<typeof PatchDestinationRequestSchema>;

export const UpsertDistributeRuleRequestSchema = z.object({
  enabled: z.boolean(),
  destinationIds: z.array(z.string().min(1)).max(50),
  requireApproval: z.boolean().default(true)
});
export type UpsertDistributeRuleRequest = z.infer<typeof UpsertDistributeRuleRequestSchema>;

export const NetworkPublicViewSchema = z.object({
  network: SocialNetworkSchema,
  adapterVersion: z.string(),
  authKind: SocialAuthKindSchema,
  configured: z.boolean(),
  missingEnv: z.array(z.string()),
  capabilities: CapabilityManifestSchema,
  oauthCallbackUrl: z.string().nullable().optional()
});
export type NetworkPublicView = z.infer<typeof NetworkPublicViewSchema>;

export const SocialConnectionViewSchema = z.object({
  id: z.string(),
  network: SocialNetworkSchema,
  authKind: SocialAuthKindSchema,
  externalUserId: z.string(),
  displayName: z.string(),
  handle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  scopes: z.array(z.string()),
  status: SocialConnectionStatusSchema,
  lastSyncedAt: z.string().nullable(),
  createdAt: z.string()
});
export type SocialConnectionView = z.infer<typeof SocialConnectionViewSchema>;

export const SocialDestinationViewSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  network: SocialNetworkSchema,
  kind: SocialDestinationKindSchema,
  externalId: z.string(),
  name: z.string(),
  handle: z.string().nullable(),
  url: z.string().nullable(),
  isDefault: z.boolean(),
  status: SocialDestinationStatusSchema,
  config: DestinationConfigSchema,
  lastSyncedAt: z.string().nullable()
});
export type SocialDestinationView = z.infer<typeof SocialDestinationViewSchema>;

export const PublishJobViewSchema = z.object({
  id: z.string(),
  packageId: z.string(),
  destinationId: z.string(),
  network: SocialNetworkSchema.optional(),
  destinationName: z.string().optional(),
  status: PublishJobStatusSchema,
  remotePostId: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  errorCode: z.string().nullable(),
  scheduledFor: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  preview: TransformPreviewSchema.optional()
});
export type PublishJobView = z.infer<typeof PublishJobViewSchema>;

export const ContentPackageViewSchema = z.object({
  id: z.string(),
  source: ContentPackageSourceSchema,
  runId: z.string().nullable(),
  media: z.array(PackageMediaItemSchema),
  copy: PackageCopySchema,
  coverGcsPath: z.string().nullable(),
  mode: PublishModeSchema,
  scheduleAt: z.string().nullable(),
  createdAt: z.string(),
  jobs: z.array(PublishJobViewSchema)
});
export type ContentPackageView = z.infer<typeof ContentPackageViewSchema>;

export const DistributeRuleViewSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  destinationIds: z.array(z.string()),
  requireApproval: z.boolean()
});
export type DistributeRuleView = z.infer<typeof DistributeRuleViewSchema>;
