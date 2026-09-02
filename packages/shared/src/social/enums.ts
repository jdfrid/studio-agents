import { z } from "zod";

export const SOCIAL_NETWORKS = ["telegram", "youtube", "facebook", "instagram", "x", "tiktok"] as const;
export const SocialNetworkSchema = z.enum(SOCIAL_NETWORKS);
export type SocialNetwork = z.infer<typeof SocialNetworkSchema>;

export const SOCIAL_AUTH_KINDS = ["oauth2", "bot_token", "app_user"] as const;
export const SocialAuthKindSchema = z.enum(SOCIAL_AUTH_KINDS);
export type SocialAuthKind = z.infer<typeof SocialAuthKindSchema>;

export const SOCIAL_CONNECTION_STATUSES = ["active", "expired", "revoked", "needs_reauth"] as const;
export const SocialConnectionStatusSchema = z.enum(SOCIAL_CONNECTION_STATUSES);
export type SocialConnectionStatus = z.infer<typeof SocialConnectionStatusSchema>;

export const SOCIAL_DESTINATION_KINDS = ["channel", "page", "profile", "group", "bot_chat", "playlist"] as const;
export const SocialDestinationKindSchema = z.enum(SOCIAL_DESTINATION_KINDS);
export type SocialDestinationKind = z.infer<typeof SocialDestinationKindSchema>;

export const SOCIAL_DESTINATION_STATUSES = ["active", "paused", "archived"] as const;
export const SocialDestinationStatusSchema = z.enum(SOCIAL_DESTINATION_STATUSES);
export type SocialDestinationStatus = z.infer<typeof SocialDestinationStatusSchema>;

export const CONTENT_PACKAGE_SOURCES = ["run", "api", "manual"] as const;
export const ContentPackageSourceSchema = z.enum(CONTENT_PACKAGE_SOURCES);
export type ContentPackageSource = z.infer<typeof ContentPackageSourceSchema>;

export const PUBLISH_MODES = ["now", "schedule", "draft"] as const;
export const PublishModeSchema = z.enum(PUBLISH_MODES);
export type PublishMode = z.infer<typeof PublishModeSchema>;

export const PUBLISH_JOB_STATUSES = [
  "queued",
  "transforming",
  "uploading",
  "processing",
  "published",
  "failed",
  "cancelled",
  "needs_review"
] as const;
export const PublishJobStatusSchema = z.enum(PUBLISH_JOB_STATUSES);
export type PublishJobStatus = z.infer<typeof PublishJobStatusSchema>;

export const PACKAGE_MEDIA_KINDS = ["video", "image", "audio"] as const;
export const PackageMediaKindSchema = z.enum(PACKAGE_MEDIA_KINDS);
export type PackageMediaKind = z.infer<typeof PackageMediaKindSchema>;
