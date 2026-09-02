import type {
  CapabilityManifest,
  DestinationConfig,
  PackageCopyInput,
  PackageMediaItem,
  SocialAuthKind,
  SocialDestinationKind,
  SocialNetwork,
  TransformPreview
} from "@studio/shared";

export const SOCIAL_ADAPTER_VERSION = "1";

export interface SocialTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  botToken?: string;
  pageTokens?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface OAuthStartInput {
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}

export interface OAuthExchangeInput {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface ConnectionIdentity {
  externalUserId: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  scopes?: string[];
}

export interface DestinationDraft {
  kind: SocialDestinationKind;
  externalId: string;
  name: string;
  handle?: string;
  url?: string;
  capabilities?: Record<string, unknown>;
  config?: DestinationConfig;
}

export interface PublishMediaFile {
  item: PackageMediaItem;
  body: Buffer;
  mimeType: string;
  filename: string;
  publicUrl?: string;
}

export interface PublishContext {
  tokens: SocialTokens;
  destination: {
    id: string;
    kind: SocialDestinationKind;
    externalId: string;
    name: string;
    handle?: string | null;
    config: DestinationConfig;
  };
  copy: PackageCopyInput;
  preview: TransformPreview;
  media: PublishMediaFile[];
  cover?: PublishMediaFile;
  scheduleAt?: Date | null;
  mode: "now" | "schedule" | "draft";
}

export interface PublishHandle {
  status: "published" | "processing" | "draft";
  remotePostId?: string;
  remoteUrl?: string;
  poll?: Record<string, unknown>;
  nativePayload?: Record<string, unknown>;
}

export interface PollContext {
  tokens: SocialTokens;
  destination: PublishContext["destination"];
  handle: Record<string, unknown>;
}

export interface NetworkAdapter {
  network: SocialNetwork;
  adapterVersion: string;
  capabilities: CapabilityManifest;
  authKind: SocialAuthKind;
  envKeys: string[];
  pkce: boolean;
  startOAuth?(input: OAuthStartInput): Promise<{ authorizeUrl: string }>;
  exchangeOAuth?(input: OAuthExchangeInput): Promise<{ tokens: SocialTokens; identity: ConnectionIdentity }>;
  refreshAuth?(tokens: SocialTokens): Promise<SocialTokens | null>;
  identify?(tokens: SocialTokens): Promise<ConnectionIdentity>;
  listDestinations(tokens: SocialTokens): Promise<DestinationDraft[]>;
  resolveDestination?(tokens: SocialTokens, hint: string): Promise<DestinationDraft | null>;
  preview(media: PackageMediaItem[], copy: PackageCopyInput, destConfig?: DestinationConfig): TransformPreview;
  publish(ctx: PublishContext): Promise<PublishHandle>;
  poll?(ctx: PollContext): Promise<PublishHandle>;
}
